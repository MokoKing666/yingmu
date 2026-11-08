/**
 * WebDemoBridge 演示数据集
 *
 * 重要：这是一组**原创虚构的演示条目**（片名、人名、封面均为程序化生成），
 * 用于让前端在没有 Rust / 媒体库的环境下真实运行、截图与测试。
 * 它不是真实影片刮削结果，也不代表任何用户的私人媒体库。
 * UI 中会以「演示数据」角标明确标注；接入 TauriBridge 后由真实扫描器替换。
 */

import type {
  MediaItem,
  MediaKind,
  MediaVersion,
  MediaSource,
  Playlist,
  PlaybackProgress,
  AudioStreamInfo,
  SubtitleStreamInfo,
  VideoStreamInfo,
} from '@yingmu/media-models';
import { stableMediaId, demoFingerprint, normalizeRelativePath } from './media-id';

export const DEMO_DATA_DISCLAIMER = '演示数据 · 原创虚构条目，非真实媒体库或刮削结果';

interface DemoSpec {
  key: string;
  title: string;
  original: string;
  year: number;
  kind: MediaKind;
  synopsis: string;
  directors: string[];
  cast: string[];
  genres: string[];
  rating: number;
  duration: number; // 秒
  favorite?: boolean;
  resume?: number;
  plays?: number;
  /** 额外版本：同一部影片的 4K / HDR / DV / 不同语言版本 */
  versions?: string[];
  addedAt: string;
}

const S: DemoSpec[] = [
  { key: 'm01', title: '雾港来信', original: 'Letters from the Fog Harbour', year: 2024, kind: 'movie', synopsis: '一座终年被雾笼罩的港口小城，邮差在整理旧信时发现一段被抹去的往事。随着信件逐一送达，城市的轮廓也在记忆里慢慢改写。', directors: ['林砚'], cast: ['周砚青', '何予', '苏迟'], genres: ['剧情', '悬疑'], rating: 8.4, duration: 7380, favorite: true, resume: 2460, plays: 3, versions: ['4K HDR', 'Dolby Vision'], addedAt: '2026-10-02T09:12:00Z' },
  { key: 'm02', title: '长夜将明', original: 'Before the Long Dawn', year: 2023, kind: 'movie', synopsis: '北方边境的最后一个冬夜，值守灯塔的两人必须在天亮前做出一个无法撤回的决定。', directors: ['陈屿'], cast: ['许牧', '白露'], genres: ['剧情'], rating: 7.9, duration: 6420, plays: 1, addedAt: '2026-10-03T11:20:00Z' },
  { key: 'm03', title: '北纬三十七度', original: 'Thirty-Seven Degrees North', year: 2025, kind: 'movie', synopsis: '一支地质考察队沿着同一条纬线横穿大陆，记录下地貌、气候与人之间细微的对应关系。', directors: ['宋岑'], cast: ['顾淮', '叶知秋'], genres: ['冒险', '剧情'], rating: 8.1, duration: 8100, versions: ['4K HDR'], addedAt: '2026-10-04T14:05:00Z' },
  { key: 'm04', title: '玻璃海', original: 'The Glass Sea', year: 2022, kind: 'movie', synopsis: '在无风的海面上，一艘船与自己的倒影相遇。一个关于重复、失重与告别的寓言。', directors: ['黎昭'], cast: ['温弥', '江阔'], genres: ['文艺', '奇幻'], rating: 8.7, duration: 6900, favorite: true, plays: 2, addedAt: '2026-10-05T08:40:00Z' },
  { key: 'm05', title: '山雀与钟', original: 'Sparrow and the Bell', year: 2021, kind: 'movie', synopsis: '山村小学的旧钟停摆之后，孩子们决定用自己的方式把时间重新敲响。', directors: ['方棠'], cast: ['罗一', '小满'], genres: ['家庭', '剧情'], rating: 7.6, duration: 5940, addedAt: '2026-10-06T16:30:00Z' },
  { key: 'm06', title: '无声之城', original: 'City Without Sound', year: 2026, kind: 'movie', synopsis: '当一座城市突然失去所有声音，一位录音师开始收集那些从未被听见的日常。', directors: ['季川'], cast: ['沈默', '陆遥'], genres: ['科幻', '剧情'], rating: 8.9, duration: 7680, favorite: true, resume: 1320, plays: 1, versions: ['4K HDR', 'Dolby Vision', '1080P 普通话'], addedAt: '2026-10-08T20:10:00Z' },
  { key: 'm07', title: '旧日岛屿', original: 'Island of Former Days', year: 2020, kind: 'movie', synopsis: '每年退潮一次才浮现的岛屿，承载着一个家族四代人未说完的话。', directors: ['柯屿'], cast: ['柳青', '闻舟'], genres: ['剧情'], rating: 7.4, duration: 6600, addedAt: '2026-10-09T07:55:00Z' },
  { key: 'm08', title: '追光的人', original: 'Those Who Chase the Light', year: 2024, kind: 'movie', synopsis: '三位放映员在胶片时代结束前的最后一次巡映，沿着海岸线把银幕支到了每一个村庄。', directors: ['贺兰'], cast: ['郑樵', '阿禾'], genres: ['剧情'], rating: 8.3, duration: 7140, favorite: true, plays: 2, addedAt: '2026-10-11T13:45:00Z' },
  { key: 'm09', title: '第七个秋天', original: 'The Seventh Autumn', year: 2019, kind: 'movie', synopsis: '同一个街角，七个秋天里的七次擦肩，以及一次终于没有错过的停留。', directors: ['唐霁'], cast: ['俞声', '甄宁'], genres: ['爱情', '剧情'], rating: 7.8, duration: 6300, addedAt: '2026-10-12T10:00:00Z' },
  { key: 'm10', title: '白昼流星', original: 'Meteor at Noon', year: 2025, kind: 'movie', synopsis: '一场白昼可见的流星雨改变了一座小城的作息，也改变了一位天文爱好者对生活节奏的理解。', directors: ['岑野'], cast: ['祝昀', '孟夏'], genres: ['科幻'], rating: 8.0, duration: 7260, versions: ['4K HDR'], addedAt: '2026-10-14T18:25:00Z' },
  { key: 'm11', title: '潮下三米', original: 'Three Metres Below', year: 2023, kind: 'movie', synopsis: '水下摄影师在沉船里发现一卷未冲洗的胶片，影像指向一段被海掩盖的工程事故。', directors: ['裴深'], cast: ['宁澈', '程野'], genres: ['悬疑', '惊悚'], rating: 7.7, duration: 6780, resume: 900, plays: 1, addedAt: '2026-10-16T21:05:00Z' },
  { key: 'm12', title: '纸上列车', original: 'The Paper Train', year: 2018, kind: 'movie', synopsis: '一位退休列车员用纸折出自己开过的每一列车，直到某天纸车开始自己移动。', directors: ['闻溪'], cast: ['老周', '阿澄'], genres: ['奇幻', '家庭'], rating: 8.2, duration: 5760, addedAt: '2026-10-18T09:35:00Z' },

  { key: 't01', title: '潮汐档案', original: 'The Tidal Archives', year: 2025, kind: 'tv', synopsis: '海边档案馆每收到一份新的潮位记录，就会对应出现一桩尚未发生的失踪案。', directors: ['林砚', '周叙'], cast: ['顾清', '白堤', '程让'], genres: ['悬疑', '剧情'], rating: 8.6, duration: 2700, favorite: true, resume: 1180, plays: 6, addedAt: '2026-10-01T12:00:00Z' },
  { key: 't02', title: '长安夜行录', original: 'Night Walk in Chang’an', year: 2024, kind: 'tv', synopsis: '夜禁之后仍有人在坊间行走，他们替这座城保管着白天不便说出的秘密。', directors: ['沈砚秋'], cast: ['李无咎', '阿罗'], genres: ['古装', '悬疑'], rating: 8.2, duration: 2820, plays: 4, addedAt: '2026-10-03T19:20:00Z' },
  { key: 't03', title: '群山之间', original: 'Between the Ranges', year: 2023, kind: 'tv', synopsis: '三条山脊上的三个家庭，因一条规划中的隧道被慢慢连在一起。', directors: ['崔岚'], cast: ['石青', '和光'], genres: ['剧情'], rating: 7.9, duration: 2640, addedAt: '2026-10-07T15:10:00Z' },
  { key: 't04', title: '气候观察站', original: 'The Weather Station', year: 2026, kind: 'tv', synopsis: '七个分布在不同纬度的观测站，用同一套表格记录着各自截然不同的今天。', directors: ['南野'], cast: ['苏合', '祁远'], genres: ['剧情', '科幻'], rating: 8.4, duration: 2580, favorite: true, plays: 2, addedAt: '2026-10-13T11:30:00Z' },
  { key: 't05', title: '旧书店街', original: 'The Street of Used Books', year: 2022, kind: 'tv', synopsis: '一条即将拆改的老街，书店老板们决定合办一场没有终点的书展。', directors: ['吴桐'], cast: ['梁伯', '小满'], genres: ['治愈', '剧情'], rating: 8.0, duration: 2460, addedAt: '2026-10-17T14:40:00Z' },

  { key: 'a01', title: '纸鹤', original: 'Paper Crane', year: 2024, kind: 'anime', synopsis: '一只被折出的纸鹤穿过整座城市，只为把一句话送到它该去的人手里。', directors: ['宫下遥'], cast: [], genres: ['动画', '奇幻'], rating: 8.8, duration: 5820, favorite: true, plays: 2, addedAt: '2026-10-02T17:00:00Z' },
  { key: 'a02', title: '鲸落之森', original: 'Forest of the Falling Whale', year: 2023, kind: 'anime', synopsis: '森林深处有一片会缓慢下沉的湖，湖底的光养活了整片林子。', directors: ['森田澪'], cast: [], genres: ['动画', '治愈'], rating: 8.5, duration: 6120, addedAt: '2026-10-06T10:20:00Z' },
  { key: 'a03', title: '云上列车', original: 'Train Above the Clouds', year: 2025, kind: 'anime', synopsis: '没有时刻表的列车只在云层很厚的日子出现，乘客必须自己决定在哪一站下车。', directors: ['小野律'], cast: [], genres: ['动画', '冒险'], rating: 8.1, duration: 5700, resume: 2100, plays: 1, addedAt: '2026-10-10T08:15:00Z' },
  { key: 'a04', title: '夏末的信箱', original: 'The Letterbox at Summer’s End', year: 2021, kind: 'anime', synopsis: '海边的旧邮筒只在暑假最后一周收信，寄出的信会在来年夏天回到自己手上。', directors: ['小野律'], cast: [], genres: ['动画', '青春'], rating: 8.3, duration: 5400, addedAt: '2026-10-15T12:50:00Z' },

  { key: 'd01', title: '大河纪事', original: 'Chronicle of a Great River', year: 2025, kind: 'documentary', synopsis: '从源头到入海口，用四年时间记录一条大河沿岸的水文、村落与季节。', directors: ['何岸'], cast: [], genres: ['纪录片', '自然'], rating: 9.1, duration: 5400, favorite: true, versions: ['4K HDR'], addedAt: '2026-10-04T09:00:00Z' },
  { key: 'd02', title: '极地静默', original: 'Silence at the Poles', year: 2024, kind: 'documentary', synopsis: '在极夜与极昼之间，观测站里三个人如何重新安排「一天」的概念。', directors: ['韩朔'], cast: [], genres: ['纪录片'], rating: 8.7, duration: 4800, addedAt: '2026-10-08T16:40:00Z' },
  { key: 'd03', title: '造物之手', original: 'Hands That Make', year: 2023, kind: 'documentary', synopsis: '十二位手艺人，十二种材料，以及他们对待「误差」的不同态度。', directors: ['苏木'], cast: [], genres: ['纪录片', '人文'], rating: 8.5, duration: 5100, plays: 1, addedAt: '2026-10-12T19:30:00Z' },
  { key: 'd04', title: '城市的声音地图', original: 'A Sonic Map of the City', year: 2026, kind: 'documentary', synopsis: '把一座城市拆成四百个采样点，用声音画出一张与行政区划完全不同的地图。', directors: ['陆回声'], cast: [], genres: ['纪录片', '声音'], rating: 8.2, duration: 4560, addedAt: '2026-10-19T11:10:00Z' },

  { key: 'p01', title: '2026 夏 · 川西', original: 'Summer 2026 · West Sichuan', year: 2026, kind: 'personal', synopsis: '个人拍摄素材，高原公路与山谷的连续镜头。', directors: [], cast: [], genres: ['个人视频'], rating: 0, duration: 1920, addedAt: '2026-10-05T20:00:00Z' },
  { key: 'p02', title: '家庭录像 · 001', original: 'Home Video 001', year: 2019, kind: 'personal', synopsis: '从旧磁带转存的家庭片段，未剪辑。', directors: [], cast: [], genres: ['个人视频'], rating: 0, duration: 3360, addedAt: '2026-10-09T18:45:00Z' },
  { key: 'p03', title: '航拍素材 · 海岸线', original: 'Aerial Footage · Coastline', year: 2025, kind: 'personal', synopsis: '沿海岸线拍摄的原始素材，用于后续剪辑。', directors: [], cast: [], genres: ['个人视频'], rating: 0, duration: 1440, resume: 320, plays: 2, addedAt: '2026-10-16T09:25:00Z' },

  // ↓ 以下 24 条为追加的原创虚构演示条目（保持原有 28 条完全不变）
  { key: 'm13', title: '霜降之前', original: 'Before the First Frost', year: 2022, kind: 'movie', synopsis: '北方小镇的初霜总在同一天到来，一位修钟人决定在那之前把停摆多年的钟楼重新校准。', directors: ['俞柯'], cast: ['孟冬', '许晏'], genres: ['剧情'], rating: 8.0, duration: 7020, favorite: true, plays: 2, addedAt: '2026-10-20T08:10:00Z' },
  { key: 'm14', title: '灯塔守夜人', original: 'The Lighthouse Keeper', year: 2020, kind: 'movie', synopsis: '一座即将自动化的灯塔，最后一位守夜人在交接前夜记录下四十年来每一场雾的形状。', directors: ['沈望'], cast: ['纪淮', '阿禾'], genres: ['悬疑', '剧情'], rating: 7.9, duration: 6540, addedAt: '2026-10-21T11:40:00Z' },
  { key: 'm15', title: '沙丘电台', original: 'Dune Radio', year: 2025, kind: 'movie', synopsis: '沙漠深处一座无人值守的短波电台，偶尔收到来自几十年前自己的信号。', directors: ['岑野'], cast: ['祝昀', '罗征'], genres: ['科幻', '剧情'], rating: 8.3, duration: 7800, versions: ['4K HDR'], addedAt: '2026-10-22T15:20:00Z' },
  { key: 'm16', title: '雨中排练', original: 'Rehearsal in the Rain', year: 2019, kind: 'movie', synopsis: '一间漏雨的排练室，两个演员在没有观众的雨季里把同一场戏演了三十七遍。', directors: ['唐霁'], cast: ['俞声', '甄宁'], genres: ['爱情', '剧情'], rating: 7.5, duration: 6120, resume: 1800, plays: 1, addedAt: '2026-10-23T09:05:00Z' },
  { key: 'm17', title: '沉船与胶片', original: 'The Wreck and the Film', year: 2024, kind: 'movie', synopsis: '打捞队从沉船里取出一卷未曝光的胶片，冲洗后出现的却是尚未发生的海难。', directors: ['裴深'], cast: ['宁澈', '程野'], genres: ['悬疑', '冒险'], rating: 8.1, duration: 7440, favorite: true, versions: ['4K HDR', 'Dolby Vision'], addedAt: '2026-10-24T20:30:00Z' },
  { key: 'm18', title: '山谷来信', original: 'Letters from the Valley', year: 2021, kind: 'movie', synopsis: '通信中断的山谷里，孩子们用风筝把写给外界的信送过山脊。', directors: ['方棠'], cast: ['罗一', '小满'], genres: ['家庭', '剧情'], rating: 7.7, duration: 6300, addedAt: '2026-10-25T07:55:00Z' },
  { key: 'm19', title: '极夜列车', original: 'Polar Night Express', year: 2026, kind: 'movie', synopsis: '极夜中不停站的一列火车，乘客们发现窗外经过的站台每次都少一个。', directors: ['季川'], cast: ['沈默', '陆遥'], genres: ['惊悚', '剧情'], rating: 8.5, duration: 7980, favorite: true, resume: 2400, plays: 3, versions: ['4K HDR'], addedAt: '2026-10-26T18:15:00Z' },
  { key: 'm20', title: '最后一格胶片', original: 'The Last Frame', year: 2018, kind: 'movie', synopsis: '老放映员退休前，把职业生涯里所有废片的最后一格剪成了一部没有片名的电影。', directors: ['贺兰'], cast: ['郑樵', '阿禾'], genres: ['文艺', '剧情'], rating: 8.6, duration: 6900, plays: 2, addedAt: '2026-10-27T10:45:00Z' },

  { key: 't06', title: '海雾观测簿', original: 'Sea Fog Ledger', year: 2025, kind: 'tv', synopsis: '海边观测站延续了六十年的海雾记录，新来的记录员发现其中几页写着未来的日期。', directors: ['林砚', '周叙'], cast: ['顾清', '白堤'], genres: ['悬疑', '剧情'], rating: 8.4, duration: 2760, favorite: true, resume: 960, plays: 5, addedAt: '2026-10-28T12:00:00Z' },
  { key: 't07', title: '山脊电台', original: 'Ridge Radio', year: 2023, kind: 'tv', synopsis: '三条山脊之间的小功率电台，替散居的农户转播天气、寻物启事与迟到的家书。', directors: ['崔岚'], cast: ['石青', '和光'], genres: ['剧情'], rating: 7.8, duration: 2520, addedAt: '2026-10-29T16:25:00Z' },
  { key: 't08', title: '旧城修缮记', original: 'Notes on Restoring an Old Town', year: 2024, kind: 'tv', synopsis: '一支修缮队在一座老城工作三年，每修好一堵墙就多知道一点它原来的样子。', directors: ['吴桐'], cast: ['梁伯', '小满'], genres: ['人文', '剧情'], rating: 8.2, duration: 2640, plays: 3, addedAt: '2026-10-30T09:35:00Z' },
  { key: 't09', title: '二十四节气厨房', original: 'A Kitchen of Twenty-Four Terms', year: 2026, kind: 'tv', synopsis: '一间只按节气开火的小厨房，每集只做一道菜，也只讲一位常客的故事。', directors: ['南野'], cast: ['苏合', '祁远'], genres: ['生活', '治愈'], rating: 8.0, duration: 2400, addedAt: '2026-10-31T14:10:00Z' },

  { key: 'a05', title: '风铃与旧车站', original: 'Wind Chime at the Old Station', year: 2024, kind: 'anime', synopsis: '停运车站屋檐下的风铃，只在有旅客真心想回来时才会响。', directors: ['宫下遥'], cast: [], genres: ['动画', '治愈'], rating: 8.6, duration: 5640, favorite: true, addedAt: '2026-11-01T08:20:00Z' },
  { key: 'a06', title: '深海邮差', original: 'The Deep-Sea Postman', year: 2022, kind: 'anime', synopsis: '住在海底邮局的邮差，负责把漂到最深处的瓶子送回它们出发的岸。', directors: ['森田澪'], cast: [], genres: ['动画', '奇幻'], rating: 8.2, duration: 5880, addedAt: '2026-11-01T17:45:00Z' },
  { key: 'a07', title: '纸飞机越过雪山', original: 'Paper Plane over the Snow Ridge', year: 2025, kind: 'anime', synopsis: '一架纸飞机越过终年积雪的山脊，替山两边的人互相捎去一句问候。', directors: ['小野律'], cast: [], genres: ['动画', '冒险'], rating: 8.4, duration: 5760, resume: 1500, plays: 1, addedAt: '2026-11-02T10:05:00Z' },
  { key: 'a08', title: '月光下的修理铺', original: 'Repair Shop under Moonlight', year: 2021, kind: 'anime', synopsis: '只在月夜开门的修理铺，修的不是物件，而是人们舍不得丢掉的回忆。', directors: ['宫下遥'], cast: [], genres: ['动画', '治愈'], rating: 8.1, duration: 5460, addedAt: '2026-11-02T19:30:00Z' },

  { key: 'd05', title: '冰川的年轮', original: 'Rings of the Glacier', year: 2025, kind: 'documentary', synopsis: '用冰芯钻取与延时摄影，读出一条冰川写下的八百年气候记录。', directors: ['韩朔'], cast: [], genres: ['纪录片', '自然'], rating: 9.0, duration: 5220, favorite: true, versions: ['4K HDR'], addedAt: '2026-11-03T09:00:00Z' },
  { key: 'd06', title: '手作纸坊', original: 'The Paper Mill', year: 2023, kind: 'documentary', synopsis: '一间仍用古法抄纸的作坊，从一道竹帘到一张纸之间的四十二道工序。', directors: ['苏木'], cast: [], genres: ['纪录片', '人文'], rating: 8.4, duration: 4860, addedAt: '2026-11-03T16:40:00Z' },
  { key: 'd07', title: '候鸟的经度', original: 'Longitudes of Migratory Birds', year: 2026, kind: 'documentary', synopsis: '沿同一条迁徙路线布设七个观测点，记录候鸟如何用经度校准自己的日历。', directors: ['何岸'], cast: [], genres: ['纪录片', '自然'], rating: 8.8, duration: 5040, plays: 2, addedAt: '2026-11-04T11:15:00Z' },
  { key: 'd08', title: '城市地下河', original: 'The River Beneath the City', year: 2024, kind: 'documentary', synopsis: '被路面盖住的那条河仍在流淌，测绘队用声音把它重新画回城市地图。', directors: ['陆回声'], cast: [], genres: ['纪录片', '城市'], rating: 8.3, duration: 4680, addedAt: '2026-11-04T20:50:00Z' },

  { key: 'p04', title: '家庭录像 · 002', original: 'Home Video 002', year: 2020, kind: 'personal', synopsis: '从旧磁带转存的家庭片段，未剪辑。', directors: [], cast: [], genres: ['个人视频'], rating: 0, duration: 2880, addedAt: '2026-11-05T08:30:00Z' },
  { key: 'p05', title: '航拍素材 · 雪山', original: 'Aerial Footage · Snow Ridge', year: 2026, kind: 'personal', synopsis: '雪山脊线连续航拍素材，用于后续剪辑。', directors: [], cast: [], genres: ['个人视频'], rating: 0, duration: 1680, resume: 400, plays: 1, addedAt: '2026-11-05T13:20:00Z' },
  { key: 'p06', title: '旅行片段 · 旧车站', original: 'Travel Clip · Old Station', year: 2024, kind: 'personal', synopsis: '旅途中在旧站台拍摄的几分钟原始素材。', directors: [], cast: [], genres: ['个人视频'], rating: 0, duration: 2160, addedAt: '2026-11-05T17:10:00Z' },
  { key: 'p07', title: '延时摄影 · 城市夜', original: 'Timelapse · City Night', year: 2025, kind: 'personal', synopsis: '天台固定机位拍摄的城市夜景延时素材。', directors: [], cast: [], genres: ['个人视频'], rating: 0, duration: 960, plays: 2, addedAt: '2026-11-05T21:00:00Z' },
];

function audioTracks(label: string): AudioStreamInfo[] {
  const hasAtmos = label.includes('Dolby Vision') || label.includes('4K HDR');
  return [
    {
      index: 0,
      codec: hasAtmos ? 'E-AC-3 JOC' : 'E-AC-3',
      channels: hasAtmos ? 8 : 6,
      language: 'zho',
      title: '普通话',
      format: hasAtmos ? 'eac3-joc' : 'eac3',
      isDefault: true,
    },
    { index: 1, codec: 'AC-3', channels: 6, language: 'eng', title: '原声', format: 'ac3' },
    { index: 2, codec: 'FLAC', channels: 2, language: 'zho', title: '评论音轨', format: 'flac' },
  ];
}

function subtitleTracks(): SubtitleStreamInfo[] {
  return [
    { index: 0, format: 'ass', language: 'zho', title: '简中特效', requiresNativeRendering: true },
    { index: 1, format: 'pgs', language: 'zho', title: '简体中文', requiresNativeRendering: true },
    { index: 2, format: 'srt', language: 'eng', title: 'English' },
    { index: 3, format: 'srt', language: 'zho', title: '外挂字幕', external: true },
  ];
}

function videoInfo(label: string): VideoStreamInfo {
  const is4k = label.includes('4K') || label.includes('Dolby Vision');
  const isDv = label.includes('Dolby Vision');
  return {
    codec: is4k ? 'HEVC' : 'H.264',
    profile: is4k ? 'Main 10' : 'High',
    width: is4k ? 3840 : 1920,
    height: is4k ? 2160 : 1080,
    frameRate: 23.976,
    bitDepth: is4k ? 10 : 8,
    colorSpace: is4k ? 'bt2020nc' : 'bt709',
    colorTransfer: isDv ? 'smpte2084' : is4k ? 'smpte2084' : 'bt709',
    colorPrimaries: is4k ? 'bt2020' : 'bt709',
    hdrFormat: isDv ? 'dolby-vision' : is4k ? 'hdr10' : 'none',
    // 仅表示「文件识别」，不代表解码 / 渲染 / 原生输出能力
    dolbyVisionProfile: isDv ? 81 : null,
    hasRpu: isDv,
    hasEnhancementLayer: false,
  };
}

function buildVersion(spec: DemoSpec, label: string, index: number, mediaId: string): MediaVersion {
  const fp = demoFingerprint(`${spec.key}:${label}`);
  const sourceId = 'src-local-demo';
  return {
    id: stableMediaId(`${fp}:version`),
    mediaId,
    sourceId,
    relativePath: normalizeRelativePath(
      `${spec.kind}/${spec.year}/${spec.title}/${spec.title}${index === 0 ? '' : `-${label.replace(/\s/g, '')}`}.mkv`,
    ),
    fingerprint: fp,
    sizeBytes: (index === 0 ? 8_900_000_000 : 24_600_000_000) + spec.key.length * 1_234_567,
    modifiedAt: `${spec.year}-08-1${(index % 9) + 1}T08:00:00Z`,
    durationSeconds: spec.duration,
    container: 'MKV',
    video: videoInfo(label),
    audio: audioTracks(label),
    subtitles: subtitleTracks(),
    chapters: [
      { index: 0, title: '开场', startSeconds: 0 },
      { index: 1, title: '第一幕', startSeconds: Math.round(spec.duration * 0.18) },
      { index: 2, title: '转折', startSeconds: Math.round(spec.duration * 0.52) },
      { index: 3, title: '尾声', startSeconds: Math.round(spec.duration * 0.86) },
    ],
    label,
    isDefault: index === 0,
  };
}

export function buildDemoLibrary(): MediaItem[] {
  return S.map((spec) => {
    const id = stableMediaId(demoFingerprint(spec.key));
    const labels = ['原版', ...(spec.versions ?? [])];
    const versions = labels.map((label, index) => buildVersion(spec, label, index, id));
    const lastPlayedAt = spec.plays
      ? new Date(new Date(spec.addedAt).getTime() + 3 * 86400_000).toISOString()
      : undefined;

    return {
      id,
      kind: spec.kind,
      metadata: {
        title: spec.title,
        originalTitle: spec.original,
        year: spec.year,
        synopsis: spec.synopsis,
        directors: spec.directors,
        cast: spec.cast,
        writers: spec.directors.slice(0, 1),
        genres: spec.genres,
        releaseDate: `${spec.year}-09-12`,
        rating: spec.kind === 'personal' ? undefined : spec.rating,
        seasonCount: spec.kind === 'tv' || spec.kind === 'anime' ? 1 : undefined,
        episodeCount: spec.kind === 'tv' ? 12 : spec.kind === 'anime' ? 13 : undefined,
        origin: 'manual',
        updatedAt: spec.addedAt,
      },
      versions,
      addedAt: spec.addedAt,
      updatedAt: spec.addedAt,
      favorite: spec.favorite ?? false,
      tags: spec.genres,
      resumeSeconds: spec.resume,
      lastPlayedAt,
      playCount: spec.plays ?? 0,
    } satisfies MediaItem;
  });
}

export const DEMO_SOURCES: MediaSource[] = [
  {
    id: 'src-local-demo',
    name: '本机媒体库（演示）',
    protocol: 'local',
    uri: '本地磁盘 / 演示数据',
    status: 'connected',
    kinds: ['movie', 'tv', 'anime', 'documentary', 'personal'],
    enabled: true,
    lastScanAt: '2026-10-20T08:00:00Z',
    itemCount: S.length,
    requiresAuth: false,
  },
  {
    id: 'src-nas-demo',
    name: '家庭 NAS（未连接）',
    protocol: 'smb',
    uri: 'SMB 共享 / 未配置',
    status: 'disconnected',
    kinds: ['movie', 'tv'],
    enabled: false,
    itemCount: 0,
    requiresAuth: true,
  },
];

export const DEMO_PLAYLISTS: Playlist[] = [
  {
    id: 'pl-weekend',
    name: '周末长片',
    description: '适合完整留出两小时的片子',
    mediaIds: [stableMediaId(demoFingerprint('m01')), stableMediaId(demoFingerprint('m04')), stableMediaId(demoFingerprint('d01'))],
    createdAt: '2026-10-06T10:00:00Z',
    updatedAt: '2026-10-18T10:00:00Z',
  },
  {
    id: 'pl-latenight',
    name: '深夜短片',
    description: '节奏慢一点，音量小一点',
    mediaIds: [stableMediaId(demoFingerprint('a02')), stableMediaId(demoFingerprint('m09'))],
    createdAt: '2026-10-12T22:00:00Z',
    updatedAt: '2026-10-12T22:00:00Z',
  },
];

export function buildDemoHistory(items: MediaItem[]): PlaybackProgress[] {
  return items
    .filter((item) => item.resumeSeconds != null && item.resumeSeconds > 0)
    .map((item) => ({
      mediaId: item.id,
      versionId: item.versions[0]!.id,
      positionSeconds: item.resumeSeconds!,
      durationSeconds: item.versions[0]!.durationSeconds ?? 0,
      completed: false,
      updatedAt: item.lastPlayedAt ?? item.addedAt,
    }));
}
