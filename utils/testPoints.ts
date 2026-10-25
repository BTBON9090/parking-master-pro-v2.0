/** Normal-UI acceptance points (not hidden window hooks). */
export interface DrivingTestPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  rotation: number;
  /** Optional deck height; 0 means ground/underpass. */
  deckHeight?: number;
  /** Short direction/expected-action hint shown in the T panel. */
  hint?: string;
}
export const CAMPUS_TEST_POINTS:DrivingTestPoint[]=[
 {id:'campus-main',label:'四区连接主路',x:1700,y:1400,rotation:0,hint:'沿主路通向曲线、紧凑倒库和斜列停车区'},
 {id:'campus-s',label:'加宽 S 弯入口',x:2890,y:605,rotation:-1.46,hint:'顺白色边线低速通过连续 S 弯'},
 {id:'campus-tight',label:'紧凑倒库入口',x:2410,y:1550,rotation:Math.PI/2,hint:'南行进入两侧错位窄车位'},
 {id:'campus-angle',label:'斜列车位入口',x:3160,y:1700,rotation:Math.PI/2,hint:'前方左转进入斜列泊车区'},
];
export const GARAGE_TEST_POINTS: DrivingTestPoint[] = [
 {id:'garage-b2-aisle',label:'B2 车位与雷达线',x:800,y:522,rotation:0,deckHeight:-96,hint:'检查三色线贴当前地板、柱子位于车位之间'},
 {id:'garage-b3-aisle',label:'B3 车位与雷达线',x:800,y:522,rotation:0,deckHeight:-144,hint:'最下层辅助线、车位与阴影'},
 {id:'garage-speed-table',label:'B1 缓坡减速带',x:580,y:242,rotation:0,deckHeight:-48,hint:'轻油门逐轮驶过 5.5 cm 连续缓坡'},
 {id:'garage-b1',label:'B1 下行坡道入口',x:1575,y:230,rotation:Math.PI/2,deckHeight:-48,hint:'沿右侧下行至 B2，末端右转进库'},
 {id:'garage-b2',label:'B2 下行坡道入口',x:1575,y:230,rotation:Math.PI/2,deckHeight:-96,hint:'沿坡道继续下行至 B3'},
 {id:'garage-b3',label:'B3 上行坡道入口',x:1625,y:770,rotation:-Math.PI/2,deckHeight:-144,hint:'靠右上坡返回 B2，末端左转进库'},
 {id:'garage-b2-up',label:'B2 上行坡道入口',x:1625,y:770,rotation:-Math.PI/2,deckHeight:-96,hint:'靠右上坡返回 B1'},
];
export const DRIVING_TEST_POINTS: DrivingTestPoint[] = [
 {id:'rollover-bank',label:'极陡横坡失稳',x:11980,y:2760,rotation:.709,hint:'约 54° 横坡；高重心皮卡翻滚，低重心车型临界角不同'},
  {id:'handling-field',label:'高速转向空地',x:10500,y:10000,rotation:0,hint:'远离障碍的平坦空地；加速后转弯，检查侧滑与车身回正'},
  { id: 'straight', label: '平直加速', x: 1180, y: 3900, rotation: 0, hint: '东向直行' },
  { id: 'long-straight', label: '主路长直道', x: 1450, y: 543, rotation: Math.atan2(-6,404), hint: '东四十条东向车道；用于高速相机检查，接近路口请刹车' },
  { id: 'slope-up', label: '坡上朝上', x: 5650, y: 4500, rotation: 0, deckHeight: 32.5, hint: '东向上坡中段' },
  { id: 'slope-down', label: '坡上朝下', x: 7350, y: 4500, rotation: 0, deckHeight: 32.5, hint: '东向下坡中段' },
  { id: 'mountain-axle-up', label: '山坡轮眉检查', x: 10720, y: 4960, rotation: -0.381762, deckHeight: 113.624, hint: '约 22° 山坡朝上；侧视检查固定轴位、裙边与接地' },
  { id: 'mountain-axle-down', label: '山坡反向检查', x: 10720, y: 4960, rotation: -0.381762 + Math.PI, deckHeight: 113.624, hint: '同一陡坡朝下；轮心不可沿车身纵向滑动' },
  { id: 'mountain-bank-left', label: '山坡横向左高', x:10720, y:4960, rotation:-.381762+Math.PI/2, deckHeight:113.624, hint:'四轮应贴坡，车轮轴与车身共用侧倾姿态' },
  { id: 'mountain-bank-right', label: '山坡横向右高', x:10720, y:4960, rotation:-.381762-Math.PI/2, deckHeight:113.624, hint:'反向横坡；检查轮眉间距与胎面接触' },
  { id: 'empty-spot', label: '空车位前', x: 4200, y: 5350, rotation: 0, hint: '东向 空车位' },
  { id: 'curb', label: '路缘入口', x: 1300, y: 4480, rotation: Math.PI / 2, hint: '南向 路缘' },
  { id: 'curb-contact', label: '轮胎越障', x: 700.2302, y: 669.3647, rotation: -0.06490869, hint: '正对 26 cm 实体路缘；低速轻油门应受阻，有速度时逐轮越过' },
  { id: 'curb-run-up', label: '越障助跑', x: 625.39, y: 674.23, rotation: -0.06490869, hint: '留出约 10 m 助跑距离，轻油门起步后观察越障减速' },
  { id: 'curb-one-side', label: '单侧路缘', x: 734.45, y: 667.14, rotation: 1.50588764, hint: '左侧轮胎贴路缘；停车时检查胎面、侧壁与独立悬架' },
  { id: 'curb-right-side', label: '右侧路缘', x: 734.45, y: 667.14, rotation: 1.50588764 + Math.PI, hint: '同一路缘掉转车头，检查右侧车轮与车身应同时抬高' },
  { id: 'gravel', label: '砂石路', x: 1500, y: 4750, rotation: Math.PI / 2, hint: '南向 砂石 gate' },
  {id:'ring-lane',label:'环岛车道',x:4700,y:4762,rotation:0,hint:'外侧车道顺环行箭头出发'},
  {id:'impact-frontal-fast',label:'高速正碰长助跑',x:2450,y:5700,rotation:-Math.PI/2,hint:'约 150 m 加速后正撞厂房，检查解体与小人恢复动作'},
  {id:'impact-frontal',label:'正碰助跑',x:2450,y:4900,rotation:-Math.PI/2,hint:'面向厂房；用于检查严重碰撞与重置'},
  {id:'impact-glance',label:'擦碰助跑',x:2000,y:3600,rotation:.2,hint:'斜向厂房外墙；检查沿墙滑移与旋转'},
  { id: 'roundabout', label: '环岛', x: 4270, y: 4500, rotation: 0, hint: '东向 环岛' },
  { id: 'bridge-ramp', label: '桥坡入口', x: 5300, y: 4500, rotation: 0, deckHeight: 0, hint: '东向上坡' },
  { id: 'bridge-top', label: '桥上入口', x: 6050, y: 4500, rotation: 0, deckHeight: 65, hint: '东向 桥面' },
  {id:'bridge-pier-edge',label:'桥面靠边通行',x:6000,y:4460,rotation:0,deckHeight:65,hint:'沿左侧通过两组桥墩，桥面不应受桥下柱体阻挡'},
  {id:'bridge-pier-return',label:'桥面反向通行',x:7100,y:4540,rotation:Math.PI,deckHeight:65,hint:'反向靠边通过两组桥墩'},
  { id: 'bridge-under', label: '桥下', x: 6500, y: 4250, rotation: Math.PI / 2, deckHeight: 0, hint: '南向 穿桥下' },
  { id: 's-curve', label: 'S 弯', x: 7900, y: 5520, rotation: Math.atan2(5500 - 5150, 7950 - 8200), hint: '沿道路切线' },
  { id: 'rough', label: '崎岖路', x: 1500, y: 5000, rotation: -Math.PI / 2, hint: '北向 崎岖 gate' },
  { id: 'collision', label: '碰撞验证', x: 2040, y: 4100, rotation: Math.PI / 2, hint: '南向 静态 NPC 尾' },
];
