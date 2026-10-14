## OpenPose

### 使い方

```bash:modelダウンロード
curl -JOL https://huggingface.co/xinsir/controlnet-openpose-sdxl-1.0/resolve/main/diffusion_pytorch_model.safetensors
```

```bash:sd-cli
--control-net ".\models\controlnet-openpose-sdxl-1.0.safetensors" --control-image ".\outputs\openpose.png" --control-strength 0.85
```

### python コード

(uv 環境)[./uv.md] が前提

posing.py

```python:posing.py
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "dwpose",
#     "onnxruntime",
#     "Pillow",
#     "matplotlib",
#     "opencv-python-headless",
#     "torch",
#     "scipy",
#     "scikit-image",
#     "huggingface_hub"
# ]
# ///

import argparse
from pathlib import Path
from PIL import Image
import numpy as np


# openpose1.png / OpenPose Editor 標準のボーン接続と配色 (RGB)
OPENPOSE1_LIMBS = [
    # (k1, k2, (R, G, B))
    (0, 1, (255, 255, 255)),   # Nose - Neck (白)
    (1, 2, (255, 0, 85)),      # Neck - RShoulder (マゼンタ赤)
    (2, 3, (255, 128, 0)),     # RShoulder - RElbow (オレンジ)
    (3, 4, (255, 230, 0)),     # RElbow - RWrist (黄色)
    (1, 5, (0, 255, 128)),     # Neck - LShoulder (ミント緑)
    (5, 6, (0, 255, 255)),     # LShoulder - LElbow (シアン)
    (6, 7, (0, 128, 255)),     # LElbow - LWrist (空色)
    (1, 8, (200, 0, 255)),     # Neck - RHip (紫)
    (8, 9, (0, 255, 0)),       # RHip - RKnee (緑)
    (9, 10, (128, 255, 0)),    # RKnee - RAnkle (黄緑)
    (1, 11, (255, 0, 200)),    # Neck - LHip (ピンク)
    (11, 12, (0, 100, 255)),   # LHip - LKnee (青)
    (12, 13, (100, 0, 255)),   # LKnee - LAnkle (藍色)
    (8, 11, (255, 0, 128)),    # RHip - LHip (★腰の棒★)
    (0, 14, (255, 255, 0)),    # Nose - REye (黄色)
    (14, 16, (255, 170, 0)),   # REye - REar (薄オレンジ)
    (0, 15, (0, 255, 255)),    # Nose - LEye (シアン)
    (15, 17, (0, 170, 255)),   # LEye - LEar (青)
]


def find_subject_bbox(img_arr: np.ndarray, margin: float = 0.20) -> np.ndarray:
    """背景と被写体を分離し、被写体の存在するタイトな Bounding Box を推定する"""
    import cv2
    h, w = img_arr.shape[:2]

    # 四隅の背景色
    corner_size = max(5, int(min(h, w) * 0.04))
    corners = [
        img_arr[:corner_size, :corner_size],
        img_arr[:corner_size, -corner_size:],
        img_arr[-corner_size:, :corner_size],
        img_arr[-corner_size:, -corner_size:],
    ]
    corner_colors = [np.median(c.reshape(-1, 3), axis=0) for c in corners]
    diffs = [np.sqrt(np.sum((img_arr.astype(np.float32) - bg) ** 2, axis=2)) for bg in corner_colors]
    min_diff = np.minimum.reduce(diffs)

    # 彩度
    hsv = cv2.cvtColor(img_arr, cv2.COLOR_RGB2HSV)
    sat = hsv[:, :, 1].astype(np.float32)

    # エッジ
    gray = cv2.cvtColor(img_arr, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 40, 120)

    # 前景マスク
    fg = (min_diff > 30.0) | (sat > 40.0) | (edges > 0)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_CLOSE, kernel)

    ys, xs = np.where(fg > 0)
    if len(xs) > (w * h * 0.005):
        x1, x2 = xs.min(), xs.max()
        y1, y2 = ys.min(), ys.max()
        pad_x = int((x2 - x1) * margin)
        pad_y = int((y2 - y1) * margin)
        x1 = max(0, x1 - pad_x)
        y1 = max(0, y1 - pad_y)
        x2 = min(w, x2 + pad_x)
        y2 = min(h, y2 + pad_y)
        if (x2 - x1) >= w * 0.25 and (y2 - y1) >= h * 0.25:
            return np.array([[x1, y1, x2, y2, 1.0]], dtype=np.float32)

    return np.array([[0, 0, w, h, 1.0]], dtype=np.float32)


def _enable_dwpose_fallback() -> None:
    """YOLOX で人物 Bbox が検出されなかった場合に、低閾値検索および前景領域推定を行うフォールバックを適用する"""
    import torch
    from dwpose.body import BodyResult, Keypoint
    from dwpose.types import PoseResult
    from dwpose.wholebody import (
        Wholebody,
        guess_onnx_input_shape_dtype,
        inference_jit_pose,
        inference_onnx_pose,
        is_model_torchscript,
    )

    if getattr(Wholebody, "_fallback_patched", False):
        return

    orig_call = Wholebody.__call__

    def patched_call(self, oriImg):
        # 1. まず通常の YOLOX を試す
        res = orig_call(self, oriImg)
        if res is not None:
            return res

        # 2. 通常の閾値(0.3)で弾かれた場合、低閾値 (0.03) で YOLOX の person (cls=0) を探す
        det_result = None
        if hasattr(self, "det") and self.det is not None and not is_model_torchscript(self.det) and "yolox" in getattr(self, "det_filename", ""):
            import dwpose.wholebody as wb
            g = wb.inference_onnx_yolox.__globals__
            preprocess = g["preprocess"]
            demo_postprocess = g["demo_postprocess"]
            multiclass_nms = g["multiclass_nms"]

            input_shape = (640, 640)
            img_arr, ratio = preprocess(oriImg, input_shape)
            input_data = img_arr[None, :, :, :].astype(np.float32)
            outNames = self.det.getUnconnectedOutLayersNames()
            self.det.setInput(input_data)
            output = self.det.forward(outNames)
            predictions = demo_postprocess(output[0], input_shape)[0]

            boxes = predictions[:, :4]
            scores = predictions[:, 4:5] * predictions[:, 5:]
            boxes_xyxy = np.ones_like(boxes)
            boxes_xyxy[:, 0] = (boxes[:, 0] - boxes[:, 2] / 2.0) / ratio
            boxes_xyxy[:, 1] = (boxes[:, 1] - boxes[:, 3] / 2.0) / ratio
            boxes_xyxy[:, 2] = (boxes[:, 0] + boxes[:, 2] / 2.0) / ratio
            boxes_xyxy[:, 3] = (boxes[:, 1] + boxes[:, 3] / 2.0) / ratio

            # 閾値を 0.03 に緩和して人物を探索
            dets = multiclass_nms(boxes_xyxy, scores, nms_thr=0.45, score_thr=0.03)
            if dets is not None:
                p_boxes = [d[:5] for d in dets if int(d[5]) == 0]
                if len(p_boxes) > 0:
                    det_result = np.array(p_boxes, dtype=np.float32)
                    # 姿勢推定モデルに入力しやすいよう 20% のマージンを付与
                    h_img, w_img = oriImg.shape[:2]
                    for b in det_result:
                        bw = b[2] - b[0]
                        bh = b[3] - b[1]
                        b[0] = max(0, b[0] - bw * 0.20)
                        b[1] = max(0, b[1] - bh * 0.20)
                        b[2] = min(w_img, b[2] + bw * 0.20)
                        b[3] = min(h_img, b[3] + bh * 0.20)

        # 3. YOLOX で見つからない場合は、被写体領域（前景）の Bbox を推定
        if det_result is None or len(det_result) == 0:
            det_result = find_subject_bbox(oriImg, margin=0.20)

        # 姿勢推定モデルを実行
        if is_model_torchscript(self.pose):
            keypoints, scores = inference_jit_pose(
                self.pose, det_result, oriImg, self.pose_input_size
            )
        else:
            _, pose_onnx_dtype = guess_onnx_input_shape_dtype(self.pose_filename)
            keypoints, scores = inference_onnx_pose(
                self.pose, det_result, oriImg, self.pose_input_size, dtype=pose_onnx_dtype
            )

        if scores is None or scores.size == 0 or scores.max() < 0.15:
            return None

        keypoints_info = np.concatenate((keypoints, scores[..., None]), axis=-1)
        # compute neck joint (両肩の最大スコアで復元)
        neck = np.mean(keypoints_info[:, [5, 6]], axis=1)
        neck[:, 2:4] = np.maximum(keypoints_info[:, 5, 2:4], keypoints_info[:, 6, 2:4])
        new_keypoints_info = np.insert(keypoints_info, 17, neck, axis=1)
        mmpose_idx = [17, 6, 8, 10, 7, 9, 12, 14, 16, 13, 15, 2, 1, 4, 3]
        openpose_idx = [1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17]
        new_keypoints_info[:, openpose_idx] = new_keypoints_info[:, mmpose_idx]
        return new_keypoints_info

    # format_result の閾値緩和（0.3 -> 0.18）
    orig_format_result = Wholebody.format_result

    @staticmethod
    def patched_format_result(keypoints_info):
        def format_keypoint_part(part, min_score=0.18):
            keypoints = [
                Keypoint(x, y, score, i) if score >= min_score else None
                for i, (x, y, score) in enumerate(part)
            ]
            return None if all(keypoint is None for keypoint in keypoints) else keypoints

        if keypoints_info is None:
            return []

        pose_results = []
        for instance in keypoints_info:
            body_keypoints = format_keypoint_part(instance[:18]) or ([None] * 18)
            left_hand = format_keypoint_part(instance[92:113])
            right_hand = format_keypoint_part(instance[113:134])
            face = format_keypoint_part(instance[24:92])

            if face is not None:
                face.append(body_keypoints[14])
                face.append(body_keypoints[15])

            total_score = sum(k.score for k in body_keypoints if k is not None)
            body = BodyResult(body_keypoints, total_score, len(body_keypoints))
            pose_results.append(PoseResult(body, left_hand, right_hand, face))

        return pose_results

    Wholebody.__call__ = patched_call
    Wholebody.format_result = patched_format_result
    Wholebody._fallback_patched = True


def complete_full_body_keypoints(keypoints: list, raw_kps_info: np.ndarray = None) -> list:
    """オクルージョン（遮蔽）や片脚・片腕が隠れている場合でも、五体満足となるようキーポイントを補完する"""
    from dwpose.body import Keypoint

    kps = list(keypoints)

    def is_valid(idx):
        return kps[idx] is not None and getattr(kps[idx], "score", 0) >= 0.18

    def get_pos(idx):
        return np.array([kps[idx].x, kps[idx].y], dtype=np.float32)

    def set_kp(idx, pos, score=0.6):
        kps[idx] = Keypoint(float(pos[0]), float(pos[1]), float(score), idx)

    # 1. 体幹補正: Neck (1) がない場合、両肩 (2, 5) の中点から推定
    if not is_valid(1) and is_valid(2) and is_valid(5):
        set_kp(1, (get_pos(2) + get_pos(5)) / 2.0)

    # 2. 脚の補完 (RHip: 8, RKnee: 9, RAnkle: 10 / LHip: 11, LKnee: 12, LAnkle: 13)
    r_leg_count = sum(1 for i in [8, 9, 10] if is_valid(i))
    l_leg_count = sum(1 for i in [11, 12, 13] if is_valid(i))

    # 右脚をベースに左脚を補完
    if r_leg_count >= 2 and l_leg_count < 2 and is_valid(8) and is_valid(9):
        r_hip = get_pos(8)
        r_knee = get_pos(9)
        thigh_vec = r_knee - r_hip
        calf_vec = (get_pos(10) - r_knee) if is_valid(10) else thigh_vec * 0.85

        # LHip
        if not is_valid(11):
            if is_valid(2) and is_valid(5):
                hip_offset = (get_pos(5) - get_pos(2)) * 0.7
                set_kp(11, r_hip + hip_offset)
            else:
                set_kp(11, r_hip + np.array([thigh_vec[1], -thigh_vec[0]]) * 0.2)
        l_hip = get_pos(11)

        # LKnee
        if not is_valid(12):
            set_kp(12, l_hip + thigh_vec)
        else:
            l_thigh_len = np.linalg.norm(get_pos(12) - l_hip)
            r_thigh_len = np.linalg.norm(thigh_vec)
            if l_thigh_len < r_thigh_len * 0.3 or l_thigh_len > r_thigh_len * 2.0:
                set_kp(12, l_hip + thigh_vec)
        l_knee = get_pos(12)

        # LAnkle
        need_recalc_l_ankle = False
        if not is_valid(13):
            if raw_kps_info is not None:
                raw_x, raw_y, _ = raw_kps_info[0, 13, :3]
                raw_calf = np.array([raw_x, raw_y]) - l_knee
                if np.dot(raw_calf, calf_vec) > 0 and 0.4 < np.linalg.norm(raw_calf) / max(1.0, np.linalg.norm(calf_vec)) < 2.0:
                    set_kp(13, np.array([raw_x, raw_y]))
                else:
                    need_recalc_l_ankle = True
            else:
                need_recalc_l_ankle = True
        else:
            l_ankle = get_pos(13)
            l_calf = l_ankle - l_knee
            if np.dot(l_calf, calf_vec) <= 0:
                need_recalc_l_ankle = True

        if need_recalc_l_ankle:
            set_kp(13, l_knee + calf_vec)

        if not is_valid(10):
            set_kp(10, r_knee + calf_vec)

    # 左脚をベースに右脚を補完
    elif l_leg_count >= 2 and r_leg_count < 2 and is_valid(11) and is_valid(12):
        l_hip = get_pos(11)
        l_knee = get_pos(12)
        thigh_vec = l_knee - l_hip
        calf_vec = (get_pos(13) - l_knee) if is_valid(13) else thigh_vec * 0.85

        if not is_valid(8):
            if is_valid(2) and is_valid(5):
                hip_offset = (get_pos(2) - get_pos(5)) * 0.7
                set_kp(8, l_hip + hip_offset)
            else:
                set_kp(8, l_hip - np.array([thigh_vec[1], -thigh_vec[0]]) * 0.2)
        r_hip = get_pos(8)

        if not is_valid(9):
            set_kp(9, r_hip + thigh_vec)
        else:
            r_thigh_len = np.linalg.norm(get_pos(9) - r_hip)
            l_thigh_len = np.linalg.norm(thigh_vec)
            if r_thigh_len < l_thigh_len * 0.3 or r_thigh_len > l_thigh_len * 2.0:
                set_kp(9, r_hip + thigh_vec)
        r_knee = get_pos(9)

        need_recalc_r_ankle = False
        if not is_valid(10):
            if raw_kps_info is not None:
                raw_x, raw_y, _ = raw_kps_info[0, 10, :3]
                raw_calf = np.array([raw_x, raw_y]) - r_knee
                if np.dot(raw_calf, calf_vec) > 0 and 0.4 < np.linalg.norm(raw_calf) / max(1.0, np.linalg.norm(calf_vec)) < 2.0:
                    set_kp(10, np.array([raw_x, raw_y]))
                else:
                    need_recalc_r_ankle = True
            else:
                need_recalc_r_ankle = True
        else:
            r_ankle = get_pos(10)
            r_calf = r_ankle - r_knee
            if np.dot(r_calf, calf_vec) <= 0:
                need_recalc_r_ankle = True

        if need_recalc_r_ankle:
            set_kp(10, r_knee + calf_vec)

        if not is_valid(13):
            set_kp(13, l_knee + calf_vec)

    # 3. 腕の補完 (RShoulder: 2, RElbow: 3, RWrist: 4 / LShoulder: 5, LElbow: 6, LWrist: 7)
    r_arm_count = sum(1 for i in [2, 3, 4] if is_valid(i))
    l_arm_count = sum(1 for i in [5, 6, 7] if is_valid(i))

    if r_arm_count >= 2 and l_arm_count < 2 and is_valid(2) and is_valid(3):
        arm_vec = get_pos(3) - get_pos(2)
        forearm_vec = (get_pos(4) - get_pos(3)) if is_valid(4) else arm_vec * 0.9
        if not is_valid(5):
            set_kp(5, get_pos(2) + np.array([20, 0]))
        if not is_valid(6):
            set_kp(6, get_pos(5) + arm_vec)
        if not is_valid(7):
            set_kp(7, get_pos(6) + forearm_vec)

    elif l_arm_count >= 2 and r_arm_count < 2 and is_valid(5) and is_valid(6):
        arm_vec = get_pos(6) - get_pos(5)
        forearm_vec = (get_pos(7) - get_pos(6)) if is_valid(7) else arm_vec * 0.9
        if not is_valid(2):
            set_kp(2, get_pos(5) - np.array([20, 0]))
        if not is_valid(3):
            set_kp(3, get_pos(2) + arm_vec)
        if not is_valid(4):
            set_kp(4, get_pos(3) + forearm_vec)

    return kps


def draw_openpose1_style(
    poses: list,
    H: int,
    W: int,
    draw_hip_link: bool = True,
    draw_face: bool = True,
    draw_hand: bool = False,
) -> np.ndarray:
    """openpose1.png と完全に一致するスタイル（腰の棒、ソリッドな各部位カラー、白い関節球）で描画する"""
    import cv2

    canvas = np.zeros((H, W, 3), dtype=np.uint8)

    # スケーリング（長辺 1200px あたり thickness=16, radius=14）
    longer_edge = max(H, W)
    scale = longer_edge / 1200.0
    thickness = max(2, int(round(16 * scale)))
    radius = max(3, int(round(14 * scale)))

    for pose in poses:
        kps = pose.body.keypoints

        # 1. ボーン（骨格の線）を描画
        for k1, k2, col in OPENPOSE1_LIMBS:
            if not draw_hip_link and (k1, k2) == (8, 11):
                continue
            if not draw_face and (k1 >= 14 or k2 >= 14):
                continue

            kp1 = kps[k1] if k1 < len(kps) else None
            kp2 = kps[k2] if k2 < len(kps) else None
            if kp1 is None or kp2 is None:
                continue

            x1 = int(round(kp1.x * W)) if kp1.x <= 1.0 else int(round(kp1.x))
            y1 = int(round(kp1.y * H)) if kp1.y <= 1.0 else int(round(kp1.y))
            x2 = int(round(kp2.x * W)) if kp2.x <= 1.0 else int(round(kp2.x))
            y2 = int(round(kp2.y * H)) if kp2.y <= 1.0 else int(round(kp2.y))

            # RGB -> BGR
            bgr = (int(col[2]), int(col[1]), int(col[0]))
            cv2.line(canvas, (x1, y1), (x2, y2), bgr, thickness=thickness, lineType=cv2.LINE_8)

        # 2. 関節（白丸）を描画（線の上に重ねる）
        for idx, kp in enumerate(kps):
            if kp is None:
                continue
            if not draw_face and idx in (14, 15, 16, 17):
                continue

            x = int(round(kp.x * W)) if kp.x <= 1.0 else int(round(kp.x))
            y = int(round(kp.y * H)) if kp.y <= 1.0 else int(round(kp.y))
            cv2.circle(canvas, (x, y), radius, (255, 255, 255), thickness=-1, lineType=cv2.LINE_8)

        # 3. 手の描画が要求された場合
        if draw_hand and hasattr(pose, "left_hand") and hasattr(pose, "right_hand"):
            from dwpose import util
            if pose.left_hand:
                canvas = util.draw_handpose(canvas, pose.left_hand)
            if pose.right_hand:
                canvas = util.draw_handpose(canvas, pose.right_hand)

    # BGR -> RGB
    return cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)


def generate_openpose_image(
    image_path: Path,
    output_path: Path,
    detect_resolution: int = 1024,
    include_hand: bool = False,
    include_face: bool = True,
    include_body: bool = True,
    match_input_size: bool = True,
    complete_limbs: bool = True,
    draw_hip_link: bool = True,
    style: str = "openpose1",
) -> None:
    if not image_path.exists():
        raise FileNotFoundError(f"Input file not found: {image_path}")

    import cv2
    from dwpose import DwposeDetector
    from dwpose.util2 import HWC3, common_input_validate, resize_image_with_pad

    _enable_dwpose_fallback()

    with Image.open(image_path) as img:
        orig_w, orig_h = img.size
        input_image, _ = common_input_validate(img, "pil")

        if detect_resolution <= 0:
            detect_resolution = max(orig_w, orig_h)

        input_image_padded, remove_pad = resize_image_with_pad(
            input_image, detect_resolution, "INTER_CUBIC"
        )

        detector = DwposeDetector.from_pretrained_default()
        poses = detector.detect_poses(input_image_padded)

        # 脚や腕が遮蔽（オクルージョン）されていても必ず五体満足にする補完処理
        if complete_limbs and poses:
            raw_kps_info = detector.dw_pose_estimation(input_image_padded.copy())
            for p in poses:
                p.body.keypoints[:] = complete_full_body_keypoints(p.body.keypoints, raw_kps_info)

        # スタイルに応じた描画
        if style == "openpose1":
            canvas = draw_openpose1_style(
                poses,
                input_image_padded.shape[0],
                input_image_padded.shape[1],
                draw_hip_link=draw_hip_link,
                draw_face=include_face,
                draw_hand=include_hand,
            )
        else:
            from dwpose import draw_poses
            canvas = draw_poses(
                poses,
                input_image_padded.shape[0],
                input_image_padded.shape[1],
                draw_body=include_body,
                draw_hand=include_hand,
                draw_face=include_face,
            )
            canvas = HWC3(canvas)

        # 余分な 64px パディングを除去
        canvas = remove_pad(canvas)

        # 元画像のオリジナル解像度・アスペクト比に完全一致
        if match_input_size:
            canvas = cv2.resize(
                canvas, (orig_w, orig_h), interpolation=cv2.INTER_LANCZOS4
            )

        result_image = Image.fromarray(canvas)

    result_image.save(output_path, "PNG")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate OpenPose image using DWPose")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("input.jpg"),
        help="Input image file path (default: input.jpg)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("openpose.png"),
        help="Output image file path (default: openpose.png)",
    )
    parser.add_argument(
        "--detect-resolution",
        type=int,
        default=1024,
        help="Detection resolution (longer edge, default: 1024; set <=0 for auto original size)",
    )
    parser.add_argument(
        "--no-face",
        action="store_true",
        default=False,
        help="Disable face keypoints",
    )
    parser.add_argument(
        "--include-hand",
        action="store_true",
        default=False,
        help="Include detailed hand keypoint detection",
    )
    parser.add_argument(
        "--no-hip-link",
        action="store_true",
        default=False,
        help="Disable horizontal hip link bone (腰の棒なし)",
    )
    parser.add_argument(
        "--no-match-size",
        action="store_true",
        default=False,
        help="Disable resizing output back to original input image size",
    )
    parser.add_argument(
        "--no-complete-limbs",
        action="store_true",
        default=False,
        help="Disable full-body completion for occluded limbs",
    )
    parser.add_argument(
        "--style",
        type=str,
        default="openpose1",
        choices=["openpose1", "dwpose"],
        help="Rendering style: 'openpose1' (OpenPose Editor style with white joints and hip link) or 'dwpose'",
    )
    args = parser.parse_args()

    generate_openpose_image(
        image_path=args.input,
        output_path=args.output,
        detect_resolution=args.detect_resolution,
        include_hand=args.include_hand,
        include_face=not args.no_face,
        match_input_size=not args.no_match_size,
        complete_limbs=not args.no_complete_limbs,
        draw_hip_link=not args.no_hip_link,
        style=args.style,
    )
```
