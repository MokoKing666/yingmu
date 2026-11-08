/**
 * 筛选子集拖拽合并的回归测试（任务书 5.3，10 项场景）。
 *
 * 背景缺陷：LibraryPage 把 Genre 筛选后的子集交给幕墙，幕墙拖拽后用子集
 * 覆盖持久化顺序——100 部电影筛出 15 部动作片拖两下，其余 85 部的自定义
 * 位置整体丢失。mergeVisibleOrder 负责把子集改动合并回完整作用域顺序。
 */
import { describe, it, expect } from 'vitest';
import { mergeVisibleOrder } from '@/lib/layout-preferences';

const FULL = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];

describe('mergeVisibleOrder：数据完整性', () => {
  it('1. 全量拖拽（无筛选）：结果就是拖拽后的顺序', () => {
    const visibleBefore = [...FULL];
    const visibleAfter = ['m3', 'm1', 'm2', 'm4', 'm5', 'm6', 'm7', 'm8'];
    expect(mergeVisibleOrder(FULL, visibleBefore, visibleAfter)).toEqual(visibleAfter);
  });

  it('2. 筛选后拖拽：子集外媒体的相对顺序与位置完整保留', () => {
    // 100 部电影筛出 3 部（m2, m5, m7），拖动后变成 m7, m2, m5
    const visibleBefore = ['m2', 'm5', 'm7'];
    const visibleAfter = ['m7', 'm2', 'm5'];
    const merged = mergeVisibleOrder(FULL, visibleBefore, visibleAfter);
    // 结果必须包含全部 8 个成员，一个都不能丢
    expect(new Set(merged)).toEqual(new Set(FULL));
    // 子集被放回锚点（m2 原来在 m1 之后），子集内部按拖拽后顺序
    expect(merged).toEqual(['m1', 'm7', 'm2', 'm5', 'm3', 'm4', 'm6', 'm8']);
    // 子集外成员的相对顺序不变：m1, m3, m4, m6, m8
    expect(merged.filter((id) => !visibleAfter.includes(id))).toEqual(['m1', 'm3', 'm4', 'm6', 'm8']);
  });

  it('3. 子集内多次拖拽：每次都在上一次结果基础上合并，不互相覆盖', () => {
    // 第一次：把 m7 拖到 m2 前面
    const after1 = mergeVisibleOrder(FULL, ['m2', 'm5', 'm7'], ['m7', 'm2', 'm5']);
    expect(after1).toEqual(['m1', 'm7', 'm2', 'm5', 'm3', 'm4', 'm6', 'm8']);
    // 第二次（切换筛选后可见集变成 m7, m3）：把 m3 拖到最前
    const visibleBefore2 = ['m7', 'm3'];
    const visibleAfter2 = ['m3', 'm7'];
    const after2 = mergeVisibleOrder(after1, visibleBefore2, visibleAfter2);
    expect(after2).toEqual(['m1', 'm3', 'm7', 'm2', 'm5', 'm4', 'm6', 'm8']);
    // 全量成员仍然完整
    expect(new Set(after2)).toEqual(new Set(FULL));
  });

  it('4. 切换其他 Genre：各自拖拽互不覆盖', () => {
    // 动作片子集 {m2,m5,m7} 拖拽后
    const actionOrder = mergeVisibleOrder(FULL, ['m2', 'm5', 'm7'], ['m7', 'm2', 'm5']);
    // 换到科幻片子集 {m1,m4,m8}，把 m8 拖到最前
    const scifiOrder = mergeVisibleOrder(actionOrder, ['m1', 'm4', 'm8'], ['m8', 'm1', 'm4']);
    // 动作片的成果（m7 在 m2 前）仍然保留
    expect(scifiOrder.indexOf('m7')).toBeLessThan(scifiOrder.indexOf('m2'));
    // 科幻片的成果也生效
    expect(scifiOrder.indexOf('m8')).toBeLessThan(scifiOrder.indexOf('m1'));
    expect(new Set(scifiOrder)).toEqual(new Set(FULL));
  });

  it('5. 清除筛选：完整顺序包含全部成员且排列完整', () => {
    const afterDrag = mergeVisibleOrder(FULL, ['m2', 'm5', 'm7'], ['m7', 'm2', 'm5']);
    // 清除筛选后看到的顺序就是 afterDrag 本身（模拟 applySortMode(custom, order)）
    expect(afterDrag).toHaveLength(FULL.length);
    expect(afterDrag).toEqual(['m1', 'm7', 'm2', 'm5', 'm3', 'm4', 'm6', 'm8']);
  });

  it('6. 新增媒体：不在 fullOrder 里的新媒体经调用方补入后不会丢', () => {
    // 应用里新增了 m9（在 fullOrder 末尾），用户拖拽旧子集
    const fullWithNew = [...FULL, 'm9'];
    const merged = mergeVisibleOrder(fullWithNew, ['m2', 'm5'], ['m5', 'm2']);
    expect(merged).toContain('m9');
    expect(merged).toEqual(['m1', 'm5', 'm2', 'm3', 'm4', 'm6', 'm7', 'm8', 'm9']);
  });

  it('7. 删除媒体：fullOrder 已不含被删条目时结果同样不含（不复活）', () => {
    const afterDelete = ['m1', 'm3', 'm4', 'm6', 'm8']; // m2 被删除
    const merged = mergeVisibleOrder(afterDelete, ['m5', 'm7'], ['m7', 'm5']);
    // m5/m7 已不在完整顺序里（属于陌生 ID），按防御规则追加到末尾
    expect(merged).toEqual(['m1', 'm3', 'm4', 'm6', 'm8', 'm7', 'm5']);
    expect(merged).not.toContain('m2');
  });

  it('8. 部分自定义排列：只拖过一个条目时其余保持原始顺序', () => {
    // 用户历史上只摆过 m5（其余从未拖过）
    const fullOrder = ['m5', 'm1', 'm2', 'm3', 'm4', 'm6', 'm7', 'm8'];
    const merged = mergeVisibleOrder(fullOrder, ['m1', 'm2'], ['m2', 'm1']);
    expect(merged).toEqual(['m5', 'm2', 'm1', 'm3', 'm4', 'm6', 'm7', 'm8']);
  });

  it('9. 未筛选媒体顺序不丢失（明确不变量）', () => {
    const visibleBefore = ['m4', 'm5', 'm6'];
    const visibleAfter = ['m6', 'm4', 'm5'];
    const merged = mergeVisibleOrder(FULL, visibleBefore, visibleAfter);
    // 前 3 与后 2 的原始相对顺序不变
    expect(merged.slice(0, 3)).toEqual(['m1', 'm2', 'm3']);
    expect(merged.slice(-2)).toEqual(['m7', 'm8']);
    expect(merged.slice(3, 6)).toEqual(['m6', 'm4', 'm5']);
  });

  it('10. 防御：陌生 ID 追加末尾；子集已连续时重复合并且幂等', () => {
    // 异常输入：visibleBefore 不在 fullOrder 里 → 追加到末尾，不崩溃
    const merged = mergeVisibleOrder(FULL, ['x1', 'x2'], ['x2', 'x1']);
    expect(merged.slice(-2)).toEqual(['x2', 'x1']);
    expect(merged.slice(0, FULL.length)).toEqual(FULL);

    // 真实拖拽后的子集在完整顺序里是连续的；用同样的可见集再合一次必须不变
    const dragged = mergeVisibleOrder(FULL, ['m2', 'm5', 'm7'], ['m7', 'm2', 'm5']);
    const again = mergeVisibleOrder(dragged, ['m7', 'm2', 'm5'], ['m7', 'm2', 'm5']);
    expect(again).toEqual(dragged);
  });
});
