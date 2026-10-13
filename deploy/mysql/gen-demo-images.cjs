/**
 * 生成本地演示商品图(SVG)到 public/demo-img/,配合 seed-demo-data.sql 使用。
 * 用法: node deploy/mysql/gen-demo-images.cjs
 * 生成 xyshNNa.svg / xyshNNb.svg 两张/商品,数据库 URL 指向 /demo-img/xyshNNx.svg。
 */
const fs = require('fs')
const path = require('path')

const OUT_DIR = path.join(__dirname, '..', '..', 'public', 'demo-img')

// 与 seed-demo-data.sql 一致:listing id → 段位/哈夫币/编号
const LISTINGS = [
  { id: 1, rank: '巅峰', hafu: '260M', no: '202609220001' },
  { id: 2, rank: '黑鹰', hafu: '180M', no: '202609220002' },
  { id: 3, rank: '钻石', hafu: '320M', no: '202609220003' },
  { id: 4, rank: '黄金', hafu: '80M', no: '202609220004' },
  { id: 5, rank: '铂金', hafu: '150M', no: '202609220005' },
  { id: 6, rank: '巅峰', hafu: '300M', no: '202609220006' },
  { id: 7, rank: '白银', hafu: '60M', no: '202609220007' },
  { id: 8, rank: '钻石', hafu: '170M', no: '202609220008' },
  { id: 9, rank: '黄金', hafu: '90M', no: '202609220009' },
  { id: 10, rank: '黑鹰', hafu: '280M', no: '202609220010' },
  { id: 11, rank: '铂金', hafu: '140M', no: '202609220011' },
  { id: 12, rank: '巅峰', hafu: '340M', no: '202609220012' }
]

// a/b 两版渐变配色调性(深色军事风,贴合三角洲行动)
const PALETTES = {
  a: ['#16233f', '#2a1a3f'],
  b: ['#0f2b2b', '#14283f']
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function svgFor({ rank, hafu, no }, variant, palette) {
  const [c1, c2] = palette
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <g fill="none" stroke="#ffffff" stroke-opacity="0.07">
    <path d="M0 300 L160 240 L320 300 L480 240 L640 300"/>
    <path d="M0 340 L160 280 L320 340 L480 280 L640 340"/>
  </g>
  <circle cx="540" cy="80" r="46" fill="#ffffff" fill-opacity="0.05"/>
  <circle cx="540" cy="80" r="30" fill="#ffffff" fill-opacity="0.07"/>
  <text x="40" y="150" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="64" font-weight="700" fill="#ffffff">${esc(rank)}</text>
  <text x="40" y="205" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="26" fill="#9fb3d1">哈夫币 ${esc(hafu)} · 三角洲行动账号</text>
  <text x="40" y="316" font-family="Consolas, monospace" font-size="16" fill="#5d7396">XYSH DEMO · ${esc(no)} · ${variant.toUpperCase()}</text>
</svg>
`
}

fs.mkdirSync(OUT_DIR, { recursive: true })
let count = 0
for (const item of LISTINGS) {
  for (const variant of ['a', 'b']) {
    const name = `xysh${String(item.id).padStart(2, '0')}${variant}.svg`
    fs.writeFileSync(path.join(OUT_DIR, name), svgFor(item, variant, PALETTES[variant]), 'utf8')
    count++
  }
}
console.log(`generated ${count} svg files -> ${OUT_DIR}`)
