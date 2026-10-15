/**
 * 大批量实机测试样例数据（仅联调/验收环境使用，生产不加载）。
 *
 * 目的：真机验收需要在真实设备上点开大量不同的实体详情页、地图展位、并且能
 * 从聊天里搜到不同的展商/产品/活动，检查长文本折行、缺失字段隐藏、多展位
 * 选择、徽标换行这些在只有 1-2 条样例时测不出来的边界情况。字段定义严格
 * 来自 chat.schema.json 的 ExhibitorEntity / ProductEntity / EventEntity，
 * 不新增任何业务字段。
 *
 * BFF（E07 详情页）和 Mock B（聊天卡片按名称匹配）共用这份数据，保证同一个
 * 实体从「聊天卡片」点进「详情页」看到的是同一份内容，ID 不会对不上。
 */

/** 与 chat.schema.json 的 ExhibitorEntity / ProductEntity / EventEntity 同形。 */
export interface EntityDetailData {
  entity_type: 'exhibitor' | 'product' | 'event';
  entity: Record<string, unknown>;
}

import { ADDRESSABLE_HALLS, type VenueHall } from './venue.js';

export { VENUE_HALLS, ADDRESSABLE_HALLS, type VenueHall } from './venue.js';
export { buildGuideExhibitors } from './guide-exhibitors.js';

/** 只用能在地图上高亮的展馆放置演示数据（见 venue.ts）。 */
const HALLS: VenueHall[] = ADDRESSABLE_HALLS;

function hallRef(hall: VenueHall) {
  return { id: hall.hallId, name: hall.name };
}

/** 展位号与 map_shape_id 都来自官方导览图，能在真实馆图上精确描边高亮。 */
function booth(hall: VenueHall, code: string) {
  return {
    booth_id: `booth_${hall.shapeSlug}_${code}`,
    display_code: code,
    map_shape_id: `shape_${hall.shapeSlug}_${code}`,
  };
}

/**
 * 展位号真实但刻意不给 map_shape_id，用来在真机上验证「缺少地图坐标时的
 * 降级提示」这条分支——不是数据缺陷。
 */
function boothWithoutShape(hall: VenueHall, code: string) {
  return {
    booth_id: `booth_${hall.shapeSlug}_${code}_nomap`,
    display_code: code,
  };
}

const EXHIBITOR_NAMES = [
  '华研生物科技',
  '悦肌美妆',
  '珂莱医疗美容',
  '芯颜国际贸易',
  '素颜研究所',
  '云肤科技',
  '沐光日化',
  '瑞妍生物',
  '灵犀美业',
  '澜珂科技',
  '素问本草',
  '悦容医疗器械',
  '芙蓉方护肤',
  '芯肌实验室',
  '云裳美甲用品',
  '悦色彩妆',
  '千雪日用化工',
  '芃蔻美发',
  '佳肤医美',
  '珍萃植萃',
  '星颜科技',
  '沁芳SPA用品',
  '卡尼尔中国代理商',
  '美盛包装material',
  '恒美OEM代工厂',
  '雅泉护肤实验室',
  '蔻蔻美睫用品',
  '妍雅美体仪器',
  '净颜科技',
  '花间集香氛',
  '昕蕾生物科技',
  '芊雅国际贸易',
  '澈净实验室',
  '悦芙医疗',
  '灵芝本草研究院',
  '云鬓假发发制品',
];

const CATEGORY_POOL = [
  '护肤精华',
  '洁面产品',
  '面膜',
  '彩妆',
  '美甲用品',
  '美发护理',
  '医美仪器',
  '香氛',
  '包装材料',
  '原料研发',
  'OEM代工',
  'SPA用品',
  '假发发制品',
  '男士护理',
  '婴童洗护',
];

const TAG_POOL = [
  'OEM',
  'ODM',
  '新品首发',
  '进口原料',
  '专利配方',
  '国货之光',
  '医美联名',
  '纯素配方',
  '孕妇可用',
  '敏感肌友好',
  '现场试用',
  '限量礼盒',
];

const FUNCTION_POOL = [
  '保湿',
  '美白',
  '抗衰',
  '控油',
  '舒缓',
  '紧致',
  '防脱',
  '去屑',
  '持久',
  '防水',
  '修护屏障',
  '淡纹',
];

const LONG_DESCRIPTION =
  '专注功能性护肤原料与配方研发十五年，拥有自有 GMP 认证生产基地与第三方检测实验室，' +
  '产品覆盖面部护理、头皮护理、身体护理三大品类，支持从原料筛选、配方打样到量产灌装的一站式 OEM/ODM 服务，' +
  '现场提供皮肤测试仪与专业顾问一对一咨询，欢迎莅临展位洽谈合作与索取样品。';

function pick<T>(pool: T[], index: number, count = 1): T[] {
  const out: T[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(pool[(index + i * 3) % pool.length] as T);
  }
  return [...new Set(out)];
}

export function buildExhibitors(): EntityDetailData[] {
  return EXHIBITOR_NAMES.map((name, index) => {
    const id = index === 0 ? 'exhibitor_huayan' : `exhibitor_e${String(index + 1).padStart(2, '0')}`;
    const hall = HALLS[index % HALLS.length] as VenueHall;
    const codes = hall.boothCodes;
    // 同一个馆里的展商依次占用不同展位，两两留空以便多展位展商取相邻展位。
    const slot = (Math.floor(index / HALLS.length) * 2) % codes.length;

    // 每隔 6 个安排一个多展位展商，用来练地图页「该展商有多个展位，请选择」分支。
    const multiBooth = index % 6 === 0;
    const booths = multiBooth
      ? [
          booth(hall, codes[slot] as string),
          booth(hall, codes[(slot + 1) % codes.length] as string),
        ]
      : [booth(hall, codes[slot] as string)];

    // 刻意错开字段完整度：约三分之一缺 description，约三分之一缺 tags，
    // 一小部分连 brands/categories 都没有——用来在大量真实样例上验证
    // 「缺失字段直接隐藏」而不是只在单元测试的 1 条 minimal fixture 上验证。
    const hasBrands = index % 4 !== 3;
    const hasCategories = index % 5 !== 4;
    const hasTags = index % 3 !== 2;
    const hasDescription = index % 3 !== 0;
    const useLongDescription = index % 9 === 0;
    const useLongName = index % 11 === 0;

    return {
      entity_type: 'exhibitor',
      entity: {
        id,
        name: useLongName ? `${name}（华南区总代理 · 金牌展商）` : name,
        ...(hasBrands ? { brands: pick(EXHIBITOR_NAMES, index, 1) } : {}),
        hall: hallRef(hall),
        booths,
        ...(hasCategories ? { categories: pick(CATEGORY_POOL, index, 1 + (index % 3)) } : {}),
        ...(hasTags ? { tags: pick(TAG_POOL, index + 1, 1 + (index % 4)) } : {}),
        ...(hasDescription
          ? { description: useLongDescription ? LONG_DESCRIPTION : `专注${pick(CATEGORY_POOL, index, 1)[0]}领域，欢迎莅临展位交流。` }
          : {}),
        status: 'published',
      },
    } satisfies EntityDetailData;
  });
}

const PRODUCT_NAME_PARTS = [
  '胶原焕颜精华',
  '玻尿酸水润面霜',
  '烟酰胺淡斑精华液',
  '氨基酸洁面慕斯',
  '视黄醇抗皱眼霜',
  '积雪草舒缓面膜',
  '虾青素抗氧化精华',
  '神经酰胺修护乳',
  '果酸焕肤精华水',
  '多肽紧致眼膜',
  '透明质酸导入仪',
  '射频美容仪',
  '头皮养护精华',
  '防脱育发液',
  '哑光唇釉套装',
  '定妆散粉',
  '睫毛增长精华',
  '美甲光疗胶套装',
  '男士控油洁面',
  '婴儿润肤乳',
  '香氛蜡烛礼盒',
  '身体磨砂膏',
  '假发定制服务',
  '包装瓶身定制',
  '原料级玻尿酸粉末',
  '中试代工套餐',
  'OEM 面膜代工',
  'SPA 精油套装',
  '美睫胶水',
  '祛痘凝胶',
];

export function buildProducts(exhibitors: EntityDetailData[]): EntityDetailData[] {
  return PRODUCT_NAME_PARTS.map((name, index) => {
    const id =
      index === 0
        ? 'product_collagen_serum'
        : `product_p${String(index + 1).padStart(2, '0')}`;
    const exhibitor = exhibitors[index % exhibitors.length] as EntityDetailData;
    const exhibitorEntity = exhibitor.entity as { id: string; hall?: { id: string; name: string }; booths?: unknown[]; name?: string };
    const hall = exhibitorEntity.hall;
    const booths = exhibitorEntity.booths as ReturnType<typeof booth>[] | undefined;

    const hasFunctions = index % 3 !== 2;
    const hasBrand = index % 4 !== 3;
    const hasTags = index % 5 !== 4;
    const hasDescription = index % 2 === 0;
    // 约五分之一的产品不带展位动作（接口没给就不显示「去展位」）。
    const hasBooths = index % 5 !== 4 && hall && booths && booths.length > 0;

    return {
      entity_type: 'product',
      entity: {
        id,
        name,
        category: pick(CATEGORY_POOL, index, 1)[0] as string,
        ...(hasFunctions ? { functions: pick(FUNCTION_POOL, index, 1 + (index % 3)) } : {}),
        ...(hasBrand ? { brand: exhibitorEntity.name } : {}),
        exhibitor_id: exhibitorEntity.id,
        ...(hasBooths && hall
          ? { hall, booths }
          : // ProductEntity 的 hall/booths 是必填字段；没有展位动作数据时仍需给一个
            // hall+booth，但故意不带 map_shape_id，让它落到地图降级提示分支。
            {
              hall: hallRef(HALLS[0] as VenueHall),
              booths: [boothWithoutShape(HALLS[0] as VenueHall, 'F99')],
            }),
        ...(hasTags ? { tags: pick(TAG_POOL, index + 2, 1 + (index % 3)) } : {}),
        ...(hasDescription ? { description: `${name}，展位现场提供试用装。` } : {}),
        status: 'published',
      },
    } satisfies EntityDetailData;
  });
}

const EVENT_NAME_PARTS = [
  'AI赋能美业论坛',
  '2026春季新品发布会',
  '医美安全趋势沙龙',
  '国货美妆出海交流会',
  '美发技术公开课',
  '香氛设计师见面会',
  '美甲艺术大赛',
  'OEM代工对接会',
  '功能性护肤研讨会',
  '直播电商美妆专场',
  '男士护理新趋势发布',
  '婴童洗护安全论坛',
  '包装可持续设计沙龙',
  '美业投资人闭门会',
  '展商颁奖晚宴',
  '开幕式',
  '闭幕式',
  '媒体见面会',
];

const EVENT_STATUS: Array<'scheduled' | 'ongoing' | 'ended' | 'cancelled'> = [
  'scheduled',
  'ongoing',
  'ended',
  'cancelled',
];

export function buildEvents(): EntityDetailData[] {
  return EVENT_NAME_PARTS.map((title, index) => {
    const id =
      index === 0 ? 'event_ai_forum' : `event_ev${String(index + 1).padStart(2, '0')}`;
    const day = 25 + (index % 3); // 2026-08-25 / 26 / 27
    const startHour = 9 + (index % 8);
    const start_at = `2026-08-${day}T${String(startHour).padStart(2, '0')}:00:00+08:00`;
    const end_at = `2026-08-${day}T${String(startHour + 1).padStart(2, '0')}:30:00+08:00`;

    const hasHall = index % 4 !== 3;
    const hall = hasHall ? (HALLS[index % HALLS.length] as VenueHall) : undefined;
    const hasSpeakers = index % 3 !== 2;
    const speakerCount = 1 + (index % 3);
    const hasTags = index % 2 === 0;
    const hasDescription = index % 3 !== 2;

    return {
      entity_type: 'event',
      entity: {
        id,
        title,
        start_at,
        end_at,
        venue: hall ? `${hall.name}${index % 2 === 0 ? '论坛区' : '发布厅'}` : '中央活动广场',
        ...(hall ? { hall: hallRef(hall) } : {}),
        status: EVENT_STATUS[index % EVENT_STATUS.length] as (typeof EVENT_STATUS)[number],
        ...(hasSpeakers
          ? { speakers: Array.from({ length: speakerCount }, (_, i) => `讲者${String.fromCharCode(65 + ((index + i) % 26))}老师`) }
          : {}),
        ...(hasTags ? { tags: pick(TAG_POOL, index, 1 + (index % 2)) } : {}),
        ...(hasDescription ? { description: `围绕「${title}」展开的现场分享，欢迎观众自由入场。` } : {}),
      },
    } satisfies EntityDetailData;
  });
}
