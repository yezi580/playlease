<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="product-icon"
    :style="{ color: iconColor }"
  >
    <!-- 哈夫币纯币 (Coins) -->
    <template v-if="name === 'coin'">
      <circle cx="12" cy="12" r="10"/>
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/>
      <path d="M12 18V6"/>
    </template>
    
    <!-- 保险等级 (Treasure chest) -->
    <template v-else-if="name === 'chest'">
      <path d="M4 14v4h16v-4" />
      <path d="M4 10h16v4H4z" />
      <path d="M12 10v4" />
      <path d="M10 6h4" />
      <path d="M12 6V4" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4" />
    </template>

    <!-- 体力等级 (Lightning) -->
    <template v-else-if="name === 'energy'">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </template>

    <!-- 负重等级 (Weight/Scale) -->
    <template v-else-if="name === 'weight'">
      <path d="M12 5v14" />
      <path d="M5 9l7-4 7 4" />
      <path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
    </template>

    <!-- 子弹 (Ammo/Bullet) -->
    <template v-else-if="name === 'ammo'">
      <path d="M8 12v6a2 2 0 0 0 4 0v-6" />
      <path d="M16 12v6a2 2 0 0 0-4 0v-6" />
      <path d="M8 12V7a4 4 0 0 1 8 0v5" />
    </template>

    <!-- 头盔 (Helmet) -->
    <template v-else-if="name === 'helmet'">
      <path d="M12 2a9 9 0 0 0-9 9v3a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-3a9 9 0 0 0-9-9z" />
      <path d="M12 22V17" />
    </template>

    <!-- 护甲 (Armor/Shield) -->
    <template v-else-if="name === 'armor'">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    </template>

    <!-- 绝密KD (Target/Crosshair) -->
    <template v-else-if="name === 'target'">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
    </template>

    <!-- 段位 (Trophy) -->
    <template v-else-if="name === 'trophy'">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </template>

    <!-- 等级 (Level/Star) -->
    <template v-else-if="name === 'level'">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </template>

    <!-- 潜水等级 (Diving) -->
    <template v-else-if="name === 'dive'">
      <path d="M2 12h4l3-3 5 6 5-6 3 3" />
      <path d="M2 18h4l3-3 5 6 5-6 3 3" />
    </template>

    <!-- 洗消舱 (Character) -->
    <template v-else-if="name === 'character'">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </template>

    <!-- 人脸归属 (Face verification) -->
    <template v-else-if="name === 'face'">
      <path d="M9 11h.01" />
      <path d="M15 11h.01" />
      <path d="M10 15a3.5 3.5 0 0 0 4 0" />
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
    </template>

    <!-- 所在地区 (Region/Map pin) -->
    <template v-else-if="name === 'location'">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </template>

    <!-- 持有刀皮 (Knife skin) -->
    <template v-else-if="name === 'knife'">
      <path d="m14.5 17.5-3-3" />
      <path d="M2 22 10.5 13.5" />
      <path d="m22 2-9.5 9.5a2.12 2.12 0 0 0 0 3l3 3a2.12 2.12 0 0 0 3 0L22 2Z" />
    </template>

    <!-- 干员外观 (Operator skin/Outfit) -->
    <template v-else-if="name === 'outfit'">
      <path d="M20.38 3.46 16 2a8.59 8.59 0 0 0-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
    </template>

    <!-- 武器皮肤 (Weapon skin/Paintbrush) -->
    <template v-else-if="name === 'weapon'">
      <path d="m9 11-6 6v3h9l3-3" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </template>

    <!-- 发布时间 (Time/Clock) -->
    <template v-else-if="name === 'clock'">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </template>
  </svg>
</template>

<script>
export default {
  name: 'ProductIcon',
  props: {
    name: {
      type: String,
      required: true
    },
    color: {
      type: String,
      default: '' // 如果没有传入 color，默认使用 CSS 中定义的颜色或动态计算
    }
  },
  computed: {
    iconColor() {
      // 如果传入了具体颜色，优先使用
      if (this.color) return this.color;
      
      // 根据图标类型返回合适的默认配色
      const colorMap = {
        'coin': '#F59E0B',     // 金色
        'chest': '#8B5CF6',    // 紫色
        'energy': '#10B981',   // 绿色 (品牌色)
        'weight': '#6B7280',   // 灰色
        'ammo': '#EF4444',     // 红色
        'helmet': '#3B82F6',   // 蓝色
        'armor': '#3B82F6',    // 蓝色
        'target': '#EF4444',   // 红色
        'trophy': '#F59E0B',   // 金色
        'level': '#F59E0B',    // 金色
        'dive': '#0EA5E9',     // 亮蓝色
        'character': '#8B5CF6',// 紫色
        'face': '#10B981',     // 绿色认证
        'location': '#EF4444', // 红色定位
        'knife': '#64748B',    // 深灰色
        'outfit': '#EC4899',   // 粉色
        'weapon': '#F97316',   // 橙色
        'clock': '#9CA3AF'     // 浅灰色
      };
      
      return colorMap[this.name] || 'var(--brand-primary)';
    }
  }
}
</script>

<style scoped>
.product-icon {
  margin-right: 4px;
  vertical-align: -2px; /* 调整和文字的对齐 */
  /* color 不再硬编码，而是通过动态 style 或 SVG 属性控制 */
  opacity: 0.9;
}
</style>
