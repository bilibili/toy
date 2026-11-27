/**
 * Static Toy square / official-account content used by the consumer home.
 *
 * This is a hand-curated snapshot for the first iteration. The owner is
 * evaluating a separate MCP feed service; until that exists the plugin does
 * not scrape the square or video APIs.
 */

export const TOY_OFFICIAL = {
  uid: 1211412540,
  name: '哔哩哔哩Toy',
  space: 'https://space.bilibili.com/1211412540',
  videos: 'https://space.bilibili.com/1211412540/video',
} as const

export interface WeeklyToy {
  readonly title: string
  readonly author: string
  readonly category: string
  readonly plays: string
  readonly poster: string
  readonly url: string
}


export const WEEKLY_EDITION = 13

export const WEEKLY_TOYS: readonly WeeklyToy[] = [
  {
    title: "Windows 10 复刻",
    author: "LING不道",
    category: "互动玩法",
    plays: "226.5w",
    poster: "https://i0.hdslb.com/bfs/static/toy/app/windows10/poster_42705.png",
    url: "https://www.bilibili.com/toy/windows10/index.html",
  },
  {
    title: "四级真题模拟器",
    author: "梦想成为测评博主",
    category: "工具",
    plays: "6.2w",
    poster: "https://i0.hdslb.com/bfs/static/toy/app/cet4-exam-simulator/poster_40726.png",
    url: "https://www.bilibili.com/toy/cet4-exam-simulator/index.html",
  },
  {
    title: "大水计算器",
    author: "Claude大小姐在B站",
    category: "游戏",
    plays: "5.6w",
    poster: "https://i0.hdslb.com/bfs/static/toy/app/dashui-jisuanqi/poster_45884.jpg",
    url: "https://www.bilibili.com/toy/dashui-jisuanqi/index.html",
  },
  {
    title: "刘晓艳行动",
    author: "Git源宝",
    category: "游戏",
    plays: "32.4w",
    poster: "https://i0.hdslb.com/bfs/static/toy/app/liuxiaoyan-action/poster_51446.jpg",
    url: "https://www.bilibili.com/toy/liuxiaoyan-action/index.html",
  },
  {
    title: "UPTI 测测哪个UP和你最像",
    author: "猫巫联盟",
    category: "测试",
    plays: "3.9w",
    poster: "https://i0.hdslb.com/bfs/static/toy/app/lMijACh3xBhHH8Xl/poster_52578.jpg",
    url: "https://www.bilibili.com/toy/lMijACh3xBhHH8Xl/index.html",
  },
  {
    title: "嘉豪模拟器",
    author: "欧了么哒",
    category: "游戏",
    plays: "82.9w",
    poster: "https://i0.hdslb.com/bfs/static/toy/app/cZxqqI0eaL7Jb4Ym/poster_52640.jpg",
    url: "https://www.bilibili.com/toy/cZxqqI0eaL7Jb4Ym/index.html",
  },
  {
    title: "堆顶频谱 · 3D音频可视化",
    author: "星辰光影_",
    category: "工具",
    plays: "5w",
    poster: "https://i0.hdslb.com/bfs/static/toy/app/99U63U2Re7H0AMRB/poster_53795.jpg",
    url: "https://www.bilibili.com/toy/99U63U2Re7H0AMRB/index.html",
  },
  {
    title: "钓鱼之王",
    author: "MARK__33",
    category: "游戏",
    plays: "6.9w",
    poster: "https://i0.hdslb.com/bfs/static/toy/app/GTA6Fishing/poster_55435.jpg",
    url: "https://www.bilibili.com/toy/GTA6Fishing/index.html",
  },
  {
    title: "影之润",
    author: "火山哥哥",
    category: "互动玩法",
    plays: "8.6w",
    poster: "https://i0.hdslb.com/bfs/static/toy/app/YinZhiRun/poster_54225.jpg",
    url: "https://www.bilibili.com/toy/YinZhiRun/index.html",
  },
  {
    title: "大明航海模拟器",
    author: "胖胖地球君",
    category: "游戏",
    plays: "3.9w",
    poster: "https://i0.hdslb.com/bfs/static/toy/app/zhenghe/poster_64339.jpg",
    url: "https://www.bilibili.com/toy/zhenghe/index.html",
  },
  {
    title: "BiliBiliOS 多系统模拟器",
    author: "土豆味小哲",
    category: "互动玩法",
    plays: "34.4w",
    poster: "https://i0.hdslb.com/bfs/static/toy/app/bilibilios/poster_57095.png",
    url: "https://www.bilibili.com/toy/bilibilios/index.html",
  },
]

export interface OfficialVideo {
  readonly title: string
  readonly views: string
  readonly duration: string
  readonly published: string
  readonly cover: string
  readonly url: string
}

export const OFFICIAL_VIDEOS: readonly OfficialVideo[] = [
  {
    title: '我把Steam复刻搬进了B站游玩Toy【点击即玩】ToyToy【B站AI创造公开赛】',
    views: '4.4万',
    duration: '01:27',
    published: '16小时前',
    cover: 'https://i1.hdslb.com/bfs/archive/8d3a98a2c2c0472f44f35f34d51dcdfab529adca.jpg',
    url: 'https://www.bilibili.com/video/BV119yCzcEBd/',
  },
  {
    title: '魂大人去旅游了，我来替他拯救影境！《影之刃·鲸》首发PV【B站AI创造公开赛】',
    views: '2046',
    duration: '01:06',
    published: '17小时前',
    cover: 'https://i1.hdslb.com/bfs/archive/d9e378e37d09281a62e188295ec7fede2e034940.jpg',
    url: 'https://www.bilibili.com/video/BV15ayrzBEXL/',
  },
  {
    title: '互动游戏【点击即玩】急招大肥鱼经纪人，包饭！【B站AI创造公开赛】',
    views: '3.9万',
    duration: '03:33',
    published: '昨天 17:00',
    cover: 'https://i1.hdslb.com/bfs/archive/605576b43a666107eee47a49f39101891674efd2.jpg',
    url: 'https://www.bilibili.com/video/BV1Gdy6zAE5R/',
  },
  {
    title: '波兰球：猜国名小游戏【B站AI创造公开赛】',
    views: '2.5万',
    duration: '01:01',
    published: '昨天 16:47',
    cover: 'https://i1.hdslb.com/bfs/archive/ac1ebbf4679c951003404effa6cd7baaee055f6e.jpg',
    url: 'https://www.bilibili.com/video/BV1Eyy6z6EM4/',
  },
  {
    title: '🐸♪我把小跳蛙做成了节奏音游♪ 🐸 【B站AI创造力公开赛】',
    views: '2580',
    duration: '01:21',
    published: '昨天 13:36',
    cover: 'https://i1.hdslb.com/bfs/archive/7031daa2b1c7d735e0ee7d2d87337a1104dcb235.jpg',
    url: 'https://www.bilibili.com/video/BV1Y3yBzsEY3/',
  },
]
