# §19.3 置信度参数敏感性网格 (纯确定性,零 LLM)

- commit: `1e3905b` · 网格:底分 ×{0.8, 1.0, 1.2} × 半衰期 ×{0.5, 1.0, 2.0} · 召回门 effectiveConfidence ≥ 80
- 默认底分 baseByFormedBy={"stated":600,"observed":350,"ruled":450,"inferred":200} · 档位阈值={"stable":750,"limited":500,"low":300}

## Part A — 底分 ±20% 对 credStatus 的敏感性

代表性输入 160 组(formedBy×contentType×support×contradict);量底分 0.8 vs 1.2 下 credStatus 是否翻转。

- **翻转率:45/160 = 28.1%**;其中**跨 >1 档的"野翻转":0**(=全是相邻单档边界跨越,系统有序、无突变)。

翻转样例(在档位边界附近才翻):

| formedBy | type | sup | con | conf@0.8 | conf@1.0 | conf@1.2 | cred 0.8→1.2 |
|---|---|---|---|---|---|---|---|
| stated | fact | 0 | 0 | 480 | 600 | 720 | low → limited |
| stated | fact | 1 | 0 | 480 | 600 | 720 | low → limited |
| stated | fact | 2 | 0 | 520 | 640 | 760 | limited → stable |
| stated | fact | 3 | 0 | 560 | 680 | 800 | limited → stable |
| stated | fact | 5 | 0 | 640 | 760 | 880 | limited → stable |
| stated | preference | 0 | 0 | 480 | 600 | 720 | low → limited |
| stated | preference | 1 | 0 | 480 | 600 | 720 | low → limited |
| stated | preference | 2 | 0 | 520 | 640 | 760 | limited → stable |
| stated | preference | 3 | 0 | 560 | 680 | 800 | limited → stable |
| stated | preference | 5 | 0 | 640 | 760 | 880 | limited → stable |
| stated | trait | 0 | 0 | 480 | 600 | 720 | low → limited |
| stated | trait | 1 | 0 | 480 | 600 | 720 | low → limited |
| stated | trait | 2 | 0 | 520 | 640 | 760 | limited → stable |
| stated | trait | 3 | 0 | 560 | 680 | 800 | limited → stable |

## Part B — 半衰期 ×0.5/1/2 对召回保留窗口的影响

各衰减类型:起始把握度 500 的认知,多少天后有效置信跌破召回门 80(= 不再被召回)。

| contentType | 默认半衰期(天) | 窗口 ×0.5 | 窗口 ×1.0 | 窗口 ×2.0 |
|---|---|---|---|---|
| state | 1.5 | 1.75d | 3.75d | 7.75d |
| hypothesis | 2 | 2.50d | 5.25d | 10.50d |
| trend | 7 | 9.25d | 18.50d | 37.00d |
| goal | 14 | 18.50d | 37.00d | 74.25d |
| project | 14 | 18.50d | 37.00d | 74.25d |
| trait | 60 | 79.50d | 159.00d | 318.25d |

## 结论

- **底分 ±20%**:翻转率 28.1%,但**野翻转(跳档)= 0**。翻转全是相邻档边界跨越,集中在 `stated` 底分(600 恰落在 limited/stable 阈值 500–750 之间),±20% 把它推过边界——这是**分档系统的固有特性、非缺陷**,系统有序无突变。
- **半衰期**:召回保留窗口随半衰期【线性】伸缩(×0.5/1/2 → 窗口 ×0.5/1/2),无悬崖/非线性突变 → 半衰期是可预测的「遗忘速度」旋钮。
- **未发现更优默认参数**(本刻画是敏感性表征,无质量信号可据以调优);默认值行为有序、可预测,**不触发** §19.3 的「改默认→D-xxxx」或「改 eval 断言→铁律1」路径。留一处观察:`stated` 底分 600 位于 limited/stable 中点,把握度定性对它较敏感——日后若要让 stated 更稳定地落 stable,可考虑抬底分或降 stable 阈值,届时以本网格为依据评估、按 §19.3 流程报批。

