<template>
  <div class="gun-page">
    <section class="gun-filter-panel">
      <button
        v-for="group in gunCodeGroups"
        :key="group.type"
        class="gun-filter-chip"
        :class="{ active: activeGunType === group.type }"
        @click="selectGunType(group.type)"
      >
        <span>{{ group.type }}</span>
        <em>{{ group.weapons.length }}</em>
      </button>
    </section>

    <section v-if="currentGunGroup" class="gun-group-section">
      <div class="gun-card-grid">
        <article
          v-for="weapon in currentGunGroup.weapons"
          :key="weapon.name"
          class="gun-code-card"
        >
          <div class="gun-card-top">
            <strong>{{ weapon.name }}</strong>
          </div>
          <div class="gun-card-body">
            <template v-if="weapon.entries.length">
              <div
                v-for="entry in weapon.entries"
                :key="entry.code"
                class="gun-code-entry"
              >
                <p class="gun-code-meta">
                  <span class="gun-code-price">{{ entry.price }}</span>
                  <span class="gun-code-description">{{ entry.description }}</span>
                </p>
                <div class="gun-code-row">
                  <code>{{ entry.code }}</code>
                  <button
                    type="button"
                    class="gun-copy-button"
                    :aria-label="`复制${weapon.name}改枪码`"
                    title="复制改枪码"
                    @click="copyGunCode(entry.code)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M9 9.75A2.25 2.25 0 0 1 11.25 7.5h6A2.25 2.25 0 0 1 19.5 9.75v8.25a2.25 2.25 0 0 1-2.25 2.25h-6A2.25 2.25 0 0 1 9 18V9.75Zm-4.5-3A2.25 2.25 0 0 1 6.75 4.5h6.75"
                        fill="none"
                        stroke="currentColor"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.8"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </template>
            <div v-else class="gun-code-placeholder">
              <code>待补充</code>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script>
import { showErrorToast, showSuccessToast } from '../utils/toast.js'

const GUN_CODE_ENTRIES = Object.freeze({
  'AS Val': [
    { price: '52万', description: '半改30发', code: '6JE2NRO0C4PRBT1BGUG84' },
    { price: '82万', description: '无激光满改', code: '6JE2NGG0C4PRBT1BGUG84' },
    { price: '99万', description: '自用满改双3S爆闪无激光', code: '6JE2VTS0C4PRBT1BGUG84' }
  ],
  M7: [
    { price: '105万', description: '满改2倍', code: '6JE40LS0C4PRBT1BGUG84' }
  ],
  'ASH-12': [
    { price: '60万', description: '满改长枪管', code: '6JE2S1O0C4PRBT1BGUG84' },
    { price: '63万', description: '满腰射短管', code: '6JE2SKC0C4PRBT1BGUG84' }
  ],
  MK47: [
    { price: '81万', description: '满腰射', code: '6JE1U4S0C4PRBT1BGUG84' },
    { price: '95万', description: '满改长枪管', code: '6JE22680C4PRBT1BGUG84' }
  ],
  K416: [
    { price: '30万', description: '半改32射程30发', code: '6JE2R0C0C4PRBT1BGUG84' },
    { price: '58万', description: '35米射程腰射混改', code: '6JE28PC0C4PRBT1BGUG84' },
    { price: '64万', description: '满改40射程60发', code: '6JE2PEO0C4PRBT1BGUG84' }
  ],
  AKM: [
    { price: '38万', description: '满改腰射', code: '6J4ELAS0E49036VVNU66T' }
  ],
  M4A1: [
    { price: '52万', description: '4.2全游第一开镜移速', code: '6JE2J8C0C4PRBT1BGUG84' },
    { price: '58万', description: '双3S爆闪满4.2开镜移速', code: '6JE2IO80C4PRBT1BGUG84' }
  ],
  MP7: [
    { price: '27万', description: '丐版腰射', code: '6JE2MSO0C4PRBT1BGUG84' },
    { price: '65万', description: '满改双爆闪', code: '6JE2NB40C4PRBT1BGUG84' }
  ],
  'SR-3M': [
    { price: '32万', description: '半改18射程腰射', code: '6JE2BK00C4PRBT1BGUG84' },
    { price: '74万', description: '满改20射程腰射', code: '6JE2C8G0C4PRBT1BGUG84' }
  ],
  Vector: [
    { price: '23万', description: '修脚', code: '6JE2E4G0C4PRBT1BGUG84' }
  ],
  QCQ171: [
    { price: '23万', description: '修脚', code: '6JE2D780C4PRBT1BGUG84' }
  ],
  P90: [
    { price: '20万', description: '丐版20射程', code: '6JE2E780C4PRBT1BGUG84' },
    { price: '34万', description: '无激光满开镜移速26米', code: '6JE2F0S0C4PRBT1BGUG84' },
    { price: '44万', description: '满改30射程', code: '6JE2E9C0C4PRBT1BGUG84' }
  ],
  MK4: [
    { price: '20万', description: '26米射程', code: '6IPUH400EP8JIUK902VF3' },
    { price: '30万', description: '32米射程', code: '6IPU22O0EP8JIUK902VF3' },
    { price: '53万', description: '满开镜移速双爆闪', code: '6IPIKFO0E07UQ3PSQGLPK' }
  ],
  '勇士冲锋枪': [
    { price: '18万', description: '无激光腰射', code: '6JE2BBS0C4PRBT1BGUG84' }
  ],
  MP5: [
    { price: '16万', description: '无激光腰射', code: '6JE2B4O0C4PRBT1BGUG84' }
  ],
  AWM: [
    { price: '92万', description: '满改', code: '6J62RV408O24JLHUUFQ3O' }
  ],
  M700: [
    { price: '40万', description: '无激光满改', code: '6J0GEQC0AM8OQLKN6JI82' }
  ],
  'SV-98': [
    { price: '11万', description: '8倍', code: '6JE2AP40C4PRBT1BGUG84' }
  ],
  R93: [
    { price: '26万', description: '长枪管3-7倍', code: '6JE2AL80C4PRBT1BGUG84' }
  ],
  M14: [
    { price: '86万', description: '满改射手步枪-烽火地带', code: '6JE2TCK0C4PRBT1BGUG84' }
  ],
  'SR-25': [
    { price: '63万', description: '满改短管', code: '6J3E3E80C4PRBT1BGUG84' },
    { price: '81万', description: '自用满改短管', code: '6J5OK5O0DTTKT6MD87Q7D' }
  ],
  'Marlin杠杆步枪': [
    { price: '17万', description: '腰射杠杆式', code: '6IM8S0407FRNEIQ1P8TDV' },
    { price: '25万', description: '长枪管杠杆', code: '6IOJFV801DQ0O3D1MD61I' }
  ],
  SVD: [
    { price: '29万', description: '机密爆头', code: '6JE1KB80C4PRBT1BGUG84' }
  ],
  M249: [
    { price: '30万', description: '高性价比长枪管轻机枪', code: '6JE2P5K0C4PRBT1BGUG84' }
  ],
  PKM: [
    { price: '34万', description: '超高性价比短管半改', code: '6JE2KRG0C4PRBT1BGUG84' },
    { price: '46万', description: '满改长枪管', code: '6JE2M2S0C4PRBT1BGUG84' },
    { price: '50万', description: '满腰射短管混改', code: '6JE2MIO0C4PRBT1BGUG84' }
  ],
  M250: [
    { price: '35万', description: '丐版', code: '6IVF3P00FV7F1VCFO05SN' },
    { price: '55万', description: '红点满改', code: '6IVF4A40FV7F1VCFO05SN' },
    { price: '58万', description: '射程倍镜满改航天', code: '6IVF15C0FV7F1VCFO05SN' }
  ],
  QJB201: [
    { price: '38万', description: '满腰射', code: '6JE1T4C0C4PRBT1BGUG84' }
  ]
})

const DOCUMENT_GUN_CODE_ENTRIES = Object.freeze({
  'AS Val': [
    { price: '70万', description: '27米光速流', code: '6K2653C0C4PRBT1BGUG84' },
    { price: '85万', description: '35米近战天王', code: '6JJSA480C4PRBT1BGUG84' },
    { price: '99万', description: '自用满改双3S爆闪无激光', code: '6JE2VTS0C4PRBT1BGUG84' }
  ],
  'ASH-12': [
    { price: '37万', description: '55米准满改短管', code: '6JPD1N00C4PRBT1BGUG84' },
    { price: '47万', description: '72米完全满改长管', code: '6JPTPQ401I1A90TH02TU8' }
  ],
  K416: [
    { price: '22万', description: '27米丐版光速流', code: '6JP4VJG0C4PRBT1BGUG84' },
    { price: '30万', description: '27米半改', code: '6JG9Q6S0C4PRBT1BGUG84' },
    { price: '52万', description: '35米满改光速流', code: '6JPTPDG01I1A90TH02TU8' }
  ],
  AKM: [
    { price: '35万', description: '47米满改', code: '6JHK228035VPG7LB68O67' }
  ],
  M4A1: [
    { price: '32万', description: '47米无3S激光4.15移速30弹夹-10据枪滑板鞋', code: '6K2ATEO0C4PRBT1BGUG84' },
    { price: '41万', description: '47米4.2移速45弹夹-10据枪圣光闪避流', code: '6K2C0QG0C4PRBT1BGUG84' },
    { price: '41万', description: '47米4.2移速30弹夹+2据枪圣光闪避流', code: '6K2D11S0C4PRBT1BGUG84' }
  ],
  '腾龙突击步枪': [
    { price: '50万', description: '46米光速流', code: '6K2CKJS0C4PRBT1BGUG84' }
  ],
  KC17: [
    { price: '50万', description: '72米满改红点长枪管', code: '6K70VR40C4PRBT1BGUG84' },
    { price: '50万', description: '72米满改2-4倍镜长枪管', code: '6K70VUK0C4PRBT1BGUG84' },
    { price: '33万', description: '55米半改短枪管45弹夹', code: '6K710FK0C4PRBT1BGUG84' }
  ],
  'MCX LT': [
    { price: '26万', description: '30米光速流', code: '6JG9N480C4PRBT1BGUG84' }
  ],
  G3: [
    { price: '26万', description: '55米光速流', code: '6JGCPOK0C4PRBT1BGUG84' }
  ],
  SG552: [
    { price: '18万', description: '41米光速流', code: '6JGCQU40C4PRBT1BGUG84' }
  ],
  'PTR-32': [
    { price: '17万', description: '40米光速流', code: '6JGCNO40C4PRBT1BGUG84' }
  ],
  MP7: [
    { price: '48万', description: '30米无名男鬼流无激光3.8移速', code: '6K7OJPK02RBTFEURU06ME' },
    { price: '33万', description: '26米半改', code: '6JGK53G0C4PRBT1BGUG84' },
    { price: '50万', description: '30米满改', code: '6K260ES0C4PRBT1BGUG84' }
  ],
  'SR-3M': [
    { price: '74万', description: '22米满改', code: '6JFLPR80C4PRBT1BGUG84' }
  ],
  Vector: [
    { price: '24万', description: '21米修脚用', code: '6JH1A7K0C4PRBT1BGUG84' },
    { price: '52万', description: '30米满改', code: '6JG9VBO0C4PRBT1BGUG84' }
  ],
  MK4: [
    { price: '39万', description: '32米满改光速流', code: '6JPTRSG01I1A90TH02TU8' },
    { price: '18万', description: '26米丐版', code: '6JLVJ3401US67C6UAK368' },
    { price: '27万', description: '30米全自动', code: '6JFNAEO0C4PRBT1BGUG84' }
  ],
  'SMG-45': [
    { price: '25万', description: '32米光速流', code: '6JG1ONC0A1FJEK12R28JB' }
  ],
  '勇士冲锋枪': [
    { price: '14万', description: '26米长枪管光速流', code: '6KAL6AG08QDH571AQV4GC' },
    { price: '11万', description: '20米修脚神器', code: '6JGCT4O0C4PRBT1BGUG84' }
  ],
  M249: [
    { price: '27万', description: '40米链锯100弹箱', code: '6JPTTMS01I1A90TH02TU8' }
  ],
  QJB201: [
    { price: '40万', description: '47米光速流60弹鼓满改', code: '6K55G2O0C4PRBT1BGUG84' },
    { price: '27万', description: '40米光速流60弹鼓半改', code: '6K1HHVS0C4PRBT1BGUG84' },
    { price: '42万', description: '40米60弹鼓满改', code: '6JHK410035VPG7LB68O67' }
  ]
})

const BILIBILI_GUN_CODE_ENTRIES = Object.freeze({
  M7: [
    { price: '64万', description: '2026-05-31 绝密模式公式化满改', code: '6K21GL008P2U69PVASVS1' },
    { price: '63万', description: '2026-05-31 绝密模式2/4倍镜款', code: '6K21EUG08P2U69PVASVS1' }
  ],
  MK47: [
    { price: '42万', description: '2026-05-31 鏖战改装', code: '6K2110S08P2U69PVASVS1' }
  ],
  '腾龙突击步枪': [
    { price: '40万', description: '2026-05-31 满改高速腾龙', code: '6K2IUPC09TGG7C6MIGQID' }
  ],
  'SR-25': [
    { price: '45万', description: '2026-05-31 短枪管高射速版', code: '6K2MTLG0055A5P4A9V28S' }
  ],
  M249: [
    { price: '20万', description: '2026-06-07 机密行动自用配枪', code: '6GBA9Q80A22U5P613I5KJ' }
  ]
})

const RECENT_PUBLIC_GUN_CODE_ENTRIES = Object.freeze({})

function mergeGunCodeEntries(primaryEntries = [], fallbackEntries = [], maxEntries = 3) {
  const mergedEntries = []
  const seenCodes = new Set()

  for (const entry of [...primaryEntries, ...fallbackEntries]) {
    if (!entry?.code || seenCodes.has(entry.code)) continue

    seenCodes.add(entry.code)
    mergedEntries.push(entry)

    if (mergedEntries.length >= maxEntries) break
  }

  return mergedEntries
}

function buildDisplayGunCodeEntries() {
  const weaponNames = new Set([
    ...Object.keys(GUN_CODE_ENTRIES),
    ...Object.keys(DOCUMENT_GUN_CODE_ENTRIES),
    ...Object.keys(BILIBILI_GUN_CODE_ENTRIES),
    ...Object.keys(RECENT_PUBLIC_GUN_CODE_ENTRIES)
  ])
  const entriesByWeapon = {}

  for (const weapon of weaponNames) {
    const recentEntries = [
      ...(DOCUMENT_GUN_CODE_ENTRIES[weapon] || []),
      ...(BILIBILI_GUN_CODE_ENTRIES[weapon] || []),
      ...(RECENT_PUBLIC_GUN_CODE_ENTRIES[weapon] || [])
    ]

    entriesByWeapon[weapon] = mergeGunCodeEntries(recentEntries, GUN_CODE_ENTRIES[weapon])
  }

  return Object.freeze(entriesByWeapon)
}

const DISPLAY_GUN_CODE_ENTRIES = buildDisplayGunCodeEntries()

const GUN_CODE_GROUPS = [
  {
    type: '突击步枪',
    weapons: ['AS Val', 'M7', 'ASH-12', 'MK47', 'K416', 'AKM', 'M4A1', 'AUG', '腾龙突击步枪', 'KC17', 'MCX LT', 'AK-12', 'K437', 'SCAR-H', 'G3', 'QBZ95-1', 'SG552', 'PTR-32', 'AKS-74U', 'M16A4', 'CAR-15']
  },
  {
    type: '冲锋枪',
    weapons: ['MP7', 'SR-3M', 'Vector', 'QCQ171', 'P90', 'MK4', 'SMG-45', '勇士冲锋枪', 'MP5', 'UZI', '野牛冲锋枪']
  },
  {
    type: '狙击步枪',
    weapons: ['AWM', 'M82', 'M700', 'SV-98', 'R93']
  },
  {
    type: '精确射手步枪',
    weapons: ['M14', 'SR-25', 'PSG-1', 'SKS', 'VSS', 'Marlin杠杆步枪', 'SVD', 'Mini-14']
  },
  {
    type: '轻机枪',
    weapons: ['M249', 'PKM', 'M250', 'QJB201']
  },
  {
    type: '霰弹枪',
    weapons: ['FS-12', 'S12K', '725双管霰弹枪']
  },
  {
    type: '手枪',
    weapons: ['G18', '93R']
  },
  {
    type: '特殊武器',
    weapons: ['复合弓']
  }
]

function buildGunCodeGroups() {
  return GUN_CODE_GROUPS.map((group) => ({
    ...group,
    weapons: group.weapons.map((weapon) => ({
      name: weapon,
      entries: DISPLAY_GUN_CODE_ENTRIES[weapon] || []
    }))
  }))
}

export default {
  name: 'GunCode',
  data() {
    return {
      gunCodeGroups: buildGunCodeGroups(),
      activeGunType: '突击步枪'
    }
  },
  computed: {
    currentGunGroup() {
      return this.gunCodeGroups.find((group) => group.type === this.activeGunType) || this.gunCodeGroups[0]
    }
  },
  methods: {
    selectGunType(type) {
      this.activeGunType = type
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    async copyGunCode(code) {
      const text = String(code || '').trim()
      if (!text) return

      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
        } else if (!this.copyGunCodeFallback(text)) {
          throw new Error('clipboard unavailable')
        }

        showSuccessToast('改枪码已复制')
      } catch (_error) {
        if (this.copyGunCodeFallback(text)) {
          showSuccessToast('改枪码已复制')
          return
        }

        showErrorToast('复制失败，请手动复制')
      }
    },
    copyGunCodeFallback(text) {
      if (typeof document === 'undefined') return false

      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', 'readonly')
      textarea.style.position = 'fixed'
      textarea.style.top = '-9999px'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      textarea.setSelectionRange(0, textarea.value.length)

      let copied = false
      try {
        copied = document.execCommand('copy')
      } catch (_error) {
        copied = false
      }

      document.body.removeChild(textarea)
      return copied
    }
  }
}
</script>

<style scoped>
.gun-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
}

.gun-filter-panel,
.gun-group-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
}

.gun-filter-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 16px;
  margin-bottom: 16px;
}

.gun-filter-chip {
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: var(--bg-subtle);
  color: var(--text-regular);
  padding: 10px 14px;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s ease;
}

.gun-filter-chip em {
  font-style: normal;
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--bg-page);
  color: var(--text-main);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.gun-filter-chip:hover {
  border-color: #111827;
  background: var(--bg-page);
}

.gun-filter-chip.active {
  border-color: #111827;
  background: #111827;
  color: #fff;
  box-shadow: 0 8px 20px rgba(17, 24, 39, 0.14);
}

.gun-filter-chip.active em {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.gun-group-section {
  padding: 22px;
}

.gun-card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.gun-code-card {
  min-height: 300px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: linear-gradient(180deg, var(--bg-card) 0%, var(--bg-subtle) 100%);
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 10px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
}

.gun-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
  margin-bottom: 2px;
}

.gun-card-top strong {
  min-width: 0;
  font-size: 20px;
  line-height: 1.2;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gun-card-body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  padding-top: 2px;
  gap: 12px;
}

.gun-code-entry {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.gun-code-entry:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.gun-code-meta {
  margin: 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}

.gun-code-price {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.gun-code-description {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-regular);
}

.gun-code-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gun-code-row code {
  display: block;
  flex: 1 1 auto;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-subtle);
  color: var(--text-main);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0.2px;
  word-break: break-all;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  box-sizing: border-box;
}

.gun-copy-button {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-regular);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: 0 0 auto;
  transition: all 0.15s ease;
}

.gun-copy-button:hover {
  border-color: #111827;
  color: var(--text-main);
  background: var(--bg-page);
}

.gun-copy-button svg {
  width: 18px;
  height: 18px;
}

.gun-code-placeholder {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 0 0;
  background: transparent;
  box-sizing: border-box;
}

.gun-code-placeholder code {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 0;
  font-family: inherit;
  box-sizing: border-box;
}

@media (max-width: 1200px) {
  .gun-page {
    margin: 0;
    padding: 12px;
  }

  .gun-filter-panel {
    gap: 8px;
    padding: 12px;
    margin-bottom: 12px;
  }

  .gun-filter-chip {
    width: calc(50% - 4px);
    justify-content: space-between;
    padding: 10px 12px;
  }

  .gun-group-section {
    padding: 16px;
  }

  .gun-card-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .gun-code-card {
    min-height: 0;
    padding: 14px;
  }

  .gun-card-top {
    gap: 6px;
  }

  .gun-card-top strong {
    font-size: 18px;
    max-width: 100%;
    white-space: normal;
  }

  .gun-code-placeholder {
    padding-top: 6px;
  }

  .gun-code-entry {
    gap: 6px;
    padding-bottom: 10px;
  }

  .gun-code-meta {
    gap: 6px;
  }

  .gun-code-price {
    font-size: 14px;
  }

  .gun-code-description {
    font-size: 13px;
  }

  .gun-code-row {
    gap: 6px;
  }

  .gun-code-row code,
  .gun-code-placeholder code {
    min-height: 32px;
    font-size: 14px;
  }

  .gun-copy-button {
    width: 34px;
    height: 34px;
    border-radius: 9px;
  }
}
</style>
