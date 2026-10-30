## お試しのやりとり

### gemma-4-26B-A4B-it-GGUF:IQ4_XS 

#### プロンプト
```text
C言語で hello,world 作って。
```
+ Thought: 10.1s

```c:Wrote hello.c
#include <stdio.h>

int main() {
    printf("hello, world\n");
    return 0;
}
```

hello.c を作成しました。
+ ▣  Build · gemma4:26b · 42.9s
#### プロンプト
```text
マクローリン展開の cos 関数を作って。
```
+ Thought: 27.9s
```c:Wrote cos_maclaurin.c
#include <stdio.h>

#define PI 3.14159265358979323846

// マクローリン展開を用いたcos関数の実装
double my_cos(double x) {
    // 範囲を [-PI, PI] に収めることで精度と収束を向上させる
    while (x > PI) x -= 2 * PI;
    while (x < -PI) x += 2 * PI;

    double sum = 1.0;
    double term = 1.0;
    double x2 = x * x;

    // 20項程度計算すれば十分な精度が得られる
    for (int n = 1; n <= 20; n++) {
        term *= -x2 / ((2 * n - 1) * (2 * n));
        sum += term;
    }
    return sum;
}

int main() {
    double test_values[] = {0, PI/6, PI/4, PI/3, PI/2, PI};
    int num_tests = sizeof(test_values) / sizeof(test_values[0]);

    printf("Testing my_cos (Maclaurin expansion):\n");
    printf("x\t\tmy_cos(x)\tmath.h cos(x)\n");
    printf("--------------------------------------------------------\n");

    for (int i = 0; i < num_tests; i++) {
        double x = test_values[i];
        // 本来は math.h の cos を使うために -lm オプションが必要
        // ここでは比較のために手動で計算した値と比較するか、単に表示する
        printf("%f\t%f\n", x, my_cos(x));
    }

    return 0;
}
```

マクローリン展開を用いた cos 関数を cos_maclaurin.c として作成しました。
+ ▣  Build · gemma4:26b · 29.5s
#### プロンプト
```text
hello.c の中に関数を移動して。
```
→Read hello.c 
→Read cos_maclaurin.c 

```c:Wrote hello.c
#include <stdio.h>

#define PI 3.14159265358979323846

// マクローリン展開を用いたcos関数の実装
double my_cos(double x) {
    // 範囲を [-PI, PI] に収めることで精度と収束を向上させる
    while (x > PI) x -= 2 * PI;
    while (x < -PI) x += 2 * PI;

    double sum = 1.0;
    double term = 1.0;
    double x2 = x * x;

    // 20項程度計算すれば十分な精度が得られる
    for (int n = 1; n <= 20; n++) {
        term *= -x2 / ((2 * n - 1) * (2 * n));
        sum += term;
    }
    return sum;
}

int main() {
    printf("hello, world\n");

    double test_values[] = {0, PI/6, PI/4, PI/3, PI/2, PI};
    int num_tests = sizeof(test_values) / sizeof(test_values[0]);

    printf("Testing my_cos (Maclaurin expansion):\n");
    printf("x\t\tmy_cos(x)\n");
    printf("--------------------------------------------------------\n");

    for (int i = 0; i < num_tests; i++) {
        double x = test_values[i];
        printf("%f\t%f\n", x, my_cos(x));
    }

    return 0;
}
```

hello.c に my_cos 関数を移動しました。
+ ▣   Build · gemma4:26b · 13.0s
#### プロンプト
```text
gcc -o hello hello.c && ./hello
これを試してみて。
```

```bash
$ gcc -o hello hello.c && ./hello
hello.c: In function ‘main’:
hello.c:29:5: error: expected ‘,’ or ‘;’ before ‘printf’
   29 |     printf("Testing my_cos (Maclaurin expansion):\n");
      |     ^~~~~~
```
+ Thought: 19.1s
→Read hello.c 
← Edit hello.c
```c
int main() {
    printf("hello, world\n");

    double test_values[] = {0, PI/6, PI/4, PI/3, PI/2, PI};
-   int num_tests = sizeof(test_values) / sizeof(test_values[0])
+   int num_tests = sizeof(test_values) / sizeof(test_values[0]);

    printf("Testing my_cos (Maclaurin expansion):\n");
    printf("x\t\tmy_cos(x)\n");
    printf("--------------------------------------------------------\n");
```

```bash
$ gcc -o hello hello.c && ./hello
hello, world
Testing my_cos (Maclaurin expansion):
x		my_cos(x)
--------------------------------------------------------
0.000000	1.000000
0.523599	0.866025
0.785398	0.707107
1.047198	0.500000
1.570796	0.000000
3.141593	-1.000000
```
コンパイルと実行に成功しました。
```text
hello, world
Testing my_cos (Maclaurin expansion):
x		my_cos(x)
--------------------------------------------------------
0.000000	1.000000
0.523599	0.866025
0.785398	0.707107
1.047198	0.500000
1.570796	0.000000
3.141593	-1.000000
```
+ ▣  Build · gemma4:26b · 29.1s
