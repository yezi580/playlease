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
  'RM277': [
    { price: '20万', description: '青春版', code: '6KFCC1K08QMG6NRUK6UQC' },
    { price: '38万', description: '半改', code: '6KFCCL408QMG6NRUK6UQC' },
    { price: '55万', description: '满改红点', code: '6KFCDT008QMG6NRUK6UQC' },
    { price: '52万', description: '满改3.5倍', code: '6KFCDOK08QMG6NRUK6UQC' },
    { price: '—', description: '金枪客任务低价版', code: '6KFCQQ808QMG6NRUK6UQC' },
  ],
  'AR-57': [
    { price: '20万', description: '腰射100', code: '6JOFC1S07OULUBJA9PRPI' },
    { price: '24万', description: '青春版', code: '6JNV7PC08MRI19EV1VB6H' },
    { price: '39万', description: '半改', code: '6JNV8GO08MRI19EV1VB6H' },
    { price: '56万', description: '双修', code: '6JNV94008MRI19EV1VB6H' },
    { price: '63万', description: '满改两倍', code: '6JNVA9008MRI19EV1VB6H' },
    { price: '66万', description: '满改红点', code: '6JNVAH008MRI19EV1VB6H' },
  ],
  'MCX LT': [
    { price: '25万', description: '长管青春版', code: '6JNVAS008MRI19EV1VB6H' },
    { price: '29万', description: '短管青春版', code: '6JNVAU808MRI19EV1VB6H' },
    { price: '39万', description: '短管半改', code: '6JNVB6008MRI19EV1VB6H' },
    { price: '50万', description: '无枪管腰射', code: '6JNVB9K08MRI19EV1VB6H' },
    { price: '54万', description: '短管满改', code: '6JNVBHO08MRI19EV1VB6H' },
    { price: '55万', description: '长管火控', code: '6JNVBRO08MRI19EV1VB6H' },
  ],
  'MK47': [
    { price: '31万', description: '青春版', code: '6JNVC5808MRI19EV1VB6H' },
    { price: '54万', description: '半改', code: '6JNVC7808MRI19EV1VB6H' },
    { price: '77万', description: '纯腰射', code: '6JNVCAO08MRI19EV1VB6H' },
    { price: '77万', description: '全能版', code: '6JNVCCK08MRI19EV1VB6H' },
    { price: '89万', description: '满改二倍', code: '6JNVCE408MRI19EV1VB6H' },
    { price: '75万', description: '满改红点', code: '6JNVCGG08MRI19EV1VB6H' },
  ],
  'KC17': [
    { price: '25万', description: '青春版', code: '6JNVCRG08MRI19EV1VB6H' },
    { price: '40万', description: '半改', code: '6JNVD0008MRI19EV1VB6H' },
    { price: '76万', description: '满改火控', code: '6JNVD1O08MRI19EV1VB6H' },
    { price: '72万', description: '红点', code: '6JOPRU808MRI19EV1VB6H' },
  ],
  'K437': [
    { price: '23万', description: '青春版', code: '6JNVD8008MRI19EV1VB6H' },
    { price: '36万', description: '半改', code: '6JNVDB408MRI19EV1VB6H' },
    { price: '75万', description: '满改红点', code: '6JNVDEK08MRI19EV1VB6H' },
    { price: '65万', description: '满改火控', code: '6JNVDGK08MRI19EV1VB6H' },
  ],
  '腾龙突击步枪': [
    { price: '57万', description: '腰射版', code: '6JNVDPK08MRI19EV1VB6H' },
    { price: '26万', description: '青春版', code: '6JNVDRK08MRI19EV1VB6H' },
    { price: '33万', description: '半改高速', code: '6KFCKF408QMG6NRUK6UQC' },
    { price: '50万', description: '高速两倍', code: '6KFCJMO08QMG6NRUK6UQC' },
    { price: '50万', description: '稳固三倍', code: '6JNVE2C08MRI19EV1VB6H' },
  ],
  'AS Val': [
    { price: '39万', description: '半改', code: '6JNVE6O08MRI19EV1VB6H' },
    { price: '78万', description: '双修', code: '6JNVEA408MRI19EV1VB6H' },
    { price: '78万', description: '刺客四连发', code: '6JNVEG008MRI19EV1VB6H' },
    { price: '75万', description: '满改红点', code: '6JNVEJO08MRI19EV1VB6H' },
  ],
  'CAR-15': [
    { price: '10万', description: '青春版', code: '6JNVENC08MRI19EV1VB6H' },
    { price: '13万', description: '腰射版', code: '6JNVEOO08MRI19EV1VB6H' },
  ],
  'PTR-32': [
    { price: '12万', description: '青春版', code: '6JNVEQG08MRI19EV1VB6H' },
    { price: '27万', description: '半改', code: '6JNVEVK08MRI19EV1VB6H' },
    { price: '—', description: '不稳版（整活）', code: '6JO03I404LB33KGUMEVKJ' },
  ],
  'G3': [
    { price: '10万', description: '青春版', code: '6JNV6T008MRI19EV1VB6H' },
    { price: '28万', description: '半改', code: '6JNV6V808MRI19EV1VB6H' },
    { price: '43万', description: '满改三倍', code: '6JNV72808MRI19EV1VB6H' },
  ],
  'SCAR-H': [
    { price: '19万', description: '青春版', code: '6JNVF7008MRI19EV1VB6H' },
    { price: '34万', description: '半改', code: '6JNVF8G08MRI19EV1VB6H' },
    { price: '61万', description: '满改三倍', code: '6JNVFF008MRI19EV1VB6H' },
    { price: '—', description: '满改腰射（整活）', code: '6JO03A404LB33KGUMEVKJ' },
  ],
  'AK-12': [
    { price: '17万', description: '青春版', code: '6JNVFOG08MRI19EV1VB6H' },
    { price: '35万', description: '半改', code: '6KFCL8C08QMG6NRUK6UQC' },
    { price: '55万', description: '满改腰射', code: '6JNVFQO08MRI19EV1VB6H' },
    { price: '51万', description: '满改火控', code: '6JNVG7O08MRI19EV1VB6H' },
  ],
  'SG552': [
    { price: '13万', description: '青春版', code: '6JNVGBC08MRI19EV1VB6H' },
    { price: '26万', description: '半改', code: '6JNVGI808MRI19EV1VB6H' },
    { price: '62万', description: '满改2/4', code: '6JNVGLG08MRI19EV1VB6H' },
    { price: '64万', description: '满改红点', code: '6JNVGNG08MRI19EV1VB6H' },
    { price: '—', description: '满改腰射（整活）', code: '6JO033004LB33KGUMEVKJ' },
  ],
  'M7': [
    { price: '39万', description: '青春版', code: '6JNVGS408MRI19EV1VB6H' },
    { price: '59万', description: '半改', code: '6JNVH3G08MRI19EV1VB6H' },
    { price: '85万', description: '满改红点', code: '6JNVH7S08MRI19EV1VB6H' },
    { price: '85万', description: '满改3.5倍', code: '6K3M4T007OULUBJA9PRPI' },
    { price: '—', description: '满改腰射（整活）', code: '6JO02UK04LB33KGUMEVKJ' },
  ],
  'AUG': [
    { price: '19万', description: '丐版三倍', code: '6JNVHG008MRI19EV1VB6H' },
    { price: '23万', description: '青春版', code: '6JNVHR808MRI19EV1VB6H' },
    { price: '31万', description: '半改', code: '6JNVI2G08MRI19EV1VB6H' },
    { price: '53万', description: '满改三倍', code: '6JNVI7G08MRI19EV1VB6H' },
  ],
  'M16A4': [
    { price: '48万', description: '三倍', code: '6JNVII808MRI19EV1VB6H' },
    { price: '27万', description: '腰射三连发', code: '6JNVILS08MRI19EV1VB6H' },
    { price: '—', description: '一根M16A4（整活）', code: '6JO02P804LB33KGUMEVKJ' },
  ],
  'K416': [
    { price: '22万', description: '青春版', code: '6JNVIQC08MRI19EV1VB6H' },
    { price: '53万', description: '腰射', code: '6JNVITK08MRI19EV1VB6H' },
    { price: '35万', description: '半改', code: '6K2GRVG0B97T7MULLRJ3C' },
    { price: '48万', description: '满改红点', code: '6JUDCBS07OULUBJA9PRPI' },
    { price: '66万', description: '满改火控', code: '6JNVJPO08MRI19EV1VB6H' },
  ],
  'ASH-12': [
    { price: '30万', description: '青春版', code: '6JNVJTO08MRI19EV1VB6H' },
    { price: '60万', description: '满改腰射', code: '6JNVK0008MRI19EV1VB6H' },
    { price: '50万', description: '战斧二倍', code: '6JNVK6408MRI19EV1VB6H' },
    { price: '50万', description: '长枪管二倍', code: '6JNVK8C08MRI19EV1VB6H' },
    { price: '46万', description: '新枪管2/4', code: '6KFSC9O07OULUBJA9PRPI' },
    { price: '—', description: '金枪客任务低价版', code: '6KFCT5C08QMG6NRUK6UQC' },
  ],
  'AKS-74U': [
    { price: '10万', description: '青春版', code: '6JNVKBK08MRI19EV1VB6H' },
  ],
  'QBZ95-1': [
    { price: '17万', description: '青春版', code: '6JNVKDK08MRI19EV1VB6H' },
    { price: '36万', description: '满改', code: '6JNVKF008MRI19EV1VB6H' },
  ],
  'AKM': [
    { price: '20万', description: '青春版', code: '6JNVLK808MRI19EV1VB6H' },
    { price: '25万', description: '腰射CS', code: '6JNVLM008MRI19EV1VB6H' },
    { price: '38万', description: '半改', code: '6JNVLN408MRI19EV1VB6H' },
    { price: '53万', description: '满改二倍', code: '6KFCMES08QMG6NRUK6UQC' },
  ],
  'M4A1': [
    { price: '19万', description: '青春版', code: '6JNVLR808MRI19EV1VB6H' },
    { price: '25万', description: '半改腰射', code: '6JNVLSG08MRI19EV1VB6H' },
    { price: '36万', description: '半改', code: '6JNVLTS08MRI19EV1VB6H' },
    { price: '59万', description: '最强腰射', code: '6JNVLVC08MRI19EV1VB6H' },
    { price: '59万', description: '满改三倍', code: '6JNVM7K08MRI19EV1VB6H' },
    { price: '65万', description: '红点', code: '6JNVMB808MRI19EV1VB6H' },
  ],
  'QCQ171': [
    { price: '28万', description: '青春版', code: '6JNVMKC08MRI19EV1VB6H' },
    { price: '63万', description: '满改红点', code: '6JNVMOG08MRI19EV1VB6H' },
  ],
  'MP7': [
    { price: '20万', description: '青春版腰射', code: '6JNVNHK08MRI19EV1VB6H' },
    { price: '60万', description: '新枪管双修', code: '6JO51LC07OULUBJA9PRPI' },
    { price: '72万', description: '满改全能', code: '6JNVNSS08MRI19EV1VB6H' },
    { price: '48万', description: '开镜移速', code: '6JNVO8O08MRI19EV1VB6H' },
  ],
  '勇士冲锋枪': [
    { price: '23万', description: '青春版腰射', code: '6JNVOBS08MRI19EV1VB6H' },
    { price: '14万', description: '青春版开镜', code: '6JNVOE408MRI19EV1VB6H' },
    { price: '53万', description: '满改腰射', code: '6JNVOPK08MRI19EV1VB6H' },
  ],
  'SR-3M': [
    { price: '23万', description: '青春版', code: '6JNVOU808MRI19EV1VB6H' },
    { price: '18万', description: '青春版腰射', code: '6JNVOVS08MRI19EV1VB6H' },
    { price: '40万', description: '半改全能', code: '6JNVP5G08MRI19EV1VB6H' },
    { price: '69万', description: '满改腰射', code: '6JNVP7O08MRI19EV1VB6H' },
    { price: '78万', description: '全能版', code: '6JNVPHC08MRI19EV1VB6H' },
    { price: '74万', description: '满改红点', code: '6JNVPK808MRI19EV1VB6H' },
  ],
  'SMG-45': [
    { price: '12万', description: '青春版开镜', code: '6JO1F6007OULUBJA9PRPI' },
    { price: '26万', description: '半改', code: '6JNV51S08MRI19EV1VB6H' },
    { price: '20万', description: '性价比腰射', code: '6JNV5F408MRI19EV1VB6H' },
    { price: '54万', description: '满改腰射', code: '6JNV5PG08MRI19EV1VB6H' },
    { price: '57万', description: '满改双修', code: '6JNV69S08MRI19EV1VB6H' },
    { price: '70万', description: '满改三倍', code: '6JNV6KO08MRI19EV1VB6H' },
  ],
  '野牛冲锋枪': [
    { price: '7万', description: '', code: '6JNVQCG08MRI19EV1VB6H' },
    { price: '55万', description: '满改带爆闪', code: '6JNVQSS08MRI19EV1VB6H' },
  ],
  'UZI': [
    { price: '12万', description: '', code: '6JNVR3C08MRI19EV1VB6H' },
  ],
  'Vector': [
    { price: '57万', description: '腰射版', code: '6JNVRDC08MRI19EV1VB6H' },
    { price: '51万', description: '开镜', code: '6JNVRIG08MRI19EV1VB6H' },
  ],
  'P90': [
    { price: '15万', description: '青春版', code: '6JNVRMO08MRI19EV1VB6H' },
    { price: '38万', description: '新枪管', code: '6JNVRPK08MRI19EV1VB6H' },
    { price: '42万', description: '满改', code: '6JNVRVC08MRI19EV1VB6H' },
  ],
  'MP5': [
    { price: '10万', description: '青春版腰射', code: '6JNVS1C08MRI19EV1VB6H' },
    { price: '44万', description: '满改腰射', code: '6JNVS4008MRI19EV1VB6H' },
  ],
  'MK4': [
    { price: '19万', description: '青春版', code: '6JNVS7408MRI19EV1VB6H' },
    { price: '31万', description: '全自动半改', code: '6JNVSU408MRI19EV1VB6H' },
    { price: '57万', description: '全自动全能', code: '6JNVS9C08MRI19EV1VB6H' },
    { price: '54万', description: '全能三连发', code: '6JNVSBO08MRI19EV1VB6H' },
    { price: '66万', description: '全自动红点', code: '6JNVSHO08MRI19EV1VB6H' },
  ],
  'PSG-1': [
    { price: '31万', description: '青春版', code: '6JO062G04LB33KGUMEVKJ' },
    { price: '56万', description: '满改', code: '6JO06C804LB33KGUMEVKJ' },
    { price: '—', description: '0开镜速度', code: '6JO02LC04LB33KGUMEVKJ' },
  ],
  'SVCH': [
    { price: '83万', description: '满改红点', code: '6KFCGHO08QMG6NRUK6UQC' },
    { price: '82万', description: '满改2/4', code: '6KFCH1408QMG6NRUK6UQC' },
    { price: '—', description: '金枪客任务低价版', code: '6KFCSOS08QMG6NRUK6UQC' },
  ],
  'M14': [
    { price: '31万', description: '青春版', code: '6JO03M404LB33KGUMEVKJ' },
    { price: '44万', description: '半改', code: '6JO03N804LB33KGUMEVKJ' },
    { price: '49万', description: '半改红点', code: '6JO03RS04LB33KGUMEVKJ' },
    { price: '75万', description: '满改红点', code: '6JO04AO04LB33KGUMEVKJ' },
    { price: '67万', description: '满改三倍', code: '6JO04JK04LB33KGUMEVKJ' },
    { price: '76万', description: '满改消音', code: '6JO04PC04LB33KGUMEVKJ' },
    { price: '—', description: '满改腰射（整活）', code: '6JO02SG04LB33KGUMEVKJ' },
  ],
  'M700': [
    { price: '29万', description: '', code: '6JO04UG04LB33KGUMEVKJ' },
    { price: '46万', description: '秒开镜', code: '6JO05B804LB33KGUMEVKJ' },
    { price: '54万', description: '初速快（金蛋可秒五级听力头及以下）', code: '6JO05ES04LB33KGUMEVKJ' },
  ],
  'SVD': [
    { price: '31万', description: '', code: '6JO06LK04LB33KGUMEVKJ' },
    { price: '60万', description: '', code: '6JO06Q004LB33KGUMEVKJ' },
    { price: '41万', description: '开镜最快', code: '6K40NRG07OULUBJA9PRPI' },
  ],
  'Mini-14': [
    { price: '24万', description: '半改', code: '6JO06VS04LB33KGUMEVKJ' },
    { price: '51万', description: '满改', code: '6JO074S04LB33KGUMEVKJ' },
  ],
  'VSS': [
    { price: '66万', description: '', code: '6JO07BC04LB33KGUMEVKJ' },
  ],
  'SR-25': [
    { price: '81万', description: '短管速射', code: '6JO07QC04LB33KGUMEVKJ' },
    { price: '91万', description: '满改', code: '6JO080C04LB33KGUMEVKJ' },
  ],
  'R93': [
    { price: '22万', description: '', code: '6JO086G04LB33KGUMEVKJ' },
  ],
  'SV-98': [
    { price: '23万', description: '', code: '6JO08A004LB33KGUMEVKJ' },
  ],
  'AWM': [
    { price: '96万', description: '初速快', code: '6JO08HO04LB33KGUMEVKJ' },
    { price: '82万', description: '开镜快', code: '6JO0FKS04LB33KGUMEVKJ' },
    { price: '—', description: '真半改AW', code: '6JO0F8K07OULUBJA9PRPI' },
  ],
  'SKS': [
    { price: '30万', description: '', code: '6JO0FS404LB33KGUMEVKJ' },
    { price: '59万', description: '', code: '6JO0G2404LB33KGUMEVKJ' },
  ],
  'Marlin杠杆步枪': [
    { price: '33万', description: '开镜', code: '6JO0G6K04LB33KGUMEVKJ' },
    { price: '15万', description: '开镜', code: '6JO0G7S04LB33KGUMEVKJ' },
    { price: '16万', description: '腰射', code: '6JO0GAC04LB33KGUMEVKJ' },
  ],
  'M82': [
    { price: '58万', description: '初速最快', code: '6KGA7FO04LB33KGUMEVKJ' },
    { price: '45万', description: '开镜最快', code: '6KGA77O04LB33KGUMEVKJ' },
  ],
  'M250': [
    { price: '30万', description: '青春版', code: '6JO0GI004LB33KGUMEVKJ' },
    { price: '45万', description: '半改', code: '6JO0GKO04LB33KGUMEVKJ' },
    { price: '85万', description: '满改三倍', code: '6JO0GMO04LB33KGUMEVKJ' },
    { price: '77万', description: '低倍', code: '6JO0GP404LB33KGUMEVKJ' },
  ],
  'PKM': [
    { price: '22万', description: '青春版', code: '6JO0GSG04LB33KGUMEVKJ' },
    { price: '31万', description: '半改', code: '6JO0H1G04LB33KGUMEVKJ' },
    { price: '57万', description: '满改2/4', code: '6JO0H8C04LB33KGUMEVKJ' },
    { price: '60万', description: '满改三倍', code: '6JO0HCK04LB33KGUMEVKJ' },
    { price: '59万', description: '满改红点', code: '6JO0HG804LB33KGUMEVKJ' },
  ],
  'QJB201': [
    { price: '20万', description: '青春版', code: '6JO0HKO04LB33KGUMEVKJ' },
    { price: '44万', description: '满改腰射', code: '6JO0HMO04LB33KGUMEVKJ' },
    { price: '58万', description: '全能版', code: '6JO0J6404LB33KGUMEVKJ' },
    { price: '56万', description: '红点高速', code: '6JO0J8O04LB33KGUMEVKJ' },
    { price: '46万', description: '100稳固', code: '6JO0JB004LB33KGUMEVKJ' },
  ],
  'M249': [
    { price: '22万', description: '青春版', code: '6JO0JI404LB33KGUMEVKJ' },
    { price: '37万', description: '链锯腰射', code: '6JPPL0S07OULUBJA9PRPI' },
    { price: '39万', description: '满改两倍', code: '6JO0JP004LB33KGUMEVKJ' },
  ],
  'S12K': [
    { price: '32万', description: '撞火全自动腰射', code: '6JO0LMK04LB33KGUMEVKJ' },
  ],
  'M1014': [
    { price: '32万', description: '', code: '6JO0LQ004LB33KGUMEVKJ' },
  ],
  '725双管霰弹枪': [
    { price: '8万', description: '腰射喷', code: '6JO0LTO04LB33KGUMEVKJ' },
    { price: '15万', description: '开镜莽侠', code: '6JO0LV404LB33KGUMEVKJ' },
  ],
  '93R': [
    { price: '15万', description: '', code: '6JO0M2C04LB33KGUMEVKJ' },
  ],
  'G18': [
    { price: '12万', description: '', code: '6JO0M4O04LB33KGUMEVKJ' },
  ],
  '沙鹰': [
    { price: '7万', description: '青春版', code: '6JO0M7404LB33KGUMEVKJ' },
    { price: '17万', description: '满改', code: '6JO0MFO04LB33KGUMEVKJ' },
    { price: '10万', description: '新枪管腰射', code: '6JO0N0C04LB33KGUMEVKJ' },
    { price: '14万', description: '新枪管眨眼', code: '6JO0MOO04LB33KGUMEVKJ' },
  ],
  '左轮手枪': [
    { price: '30万', description: '三倍狙', code: '6JO0NGK04LB33KGUMEVKJ' },
  ],
  '复合弓': [
    { price: '20万', description: '速射腰射', code: '6KFCNRG08QMG6NRUK6UQC' },
    { price: '24万', description: '速射开镜', code: '6KFCO6008QMG6NRUK6UQC' },
    { price: '48万', description: '开镜', code: '6KFCODC08QMG6NRUK6UQC' },
    { price: '44万', description: '腰射弓', code: '6KFCOKK08QMG6NRUK6UQC' },
  ],
  'FS-12': [
    { price: '31万', description: '', code: '6JO0NSG04LB33KGUMEVKJ' },
  ],
  'M870': [
    { price: '38万', description: '', code: '6JO1N1007OULUBJA9PRPI' },
  ],
  'M1911': [
    { price: '12万', description: '', code: '6JO1LUK07OULUBJA9PRPI' },
  ],
})

const GUN_CODE_GROUPS = [
  {
    type: '突击步枪',
    weapons: ['RM277', 'AR-57', 'MCX LT', 'MK47', 'KC17', 'K437', '腾龙突击步枪', 'AS Val', 'CAR-15', 'PTR-32', 'G3', 'SCAR-H', 'AK-12', 'SG552', 'M7', 'AUG', 'M16A4', 'K416', 'ASH-12', 'AKS-74U', 'QBZ95-1', 'AKM', 'M4A1']
  },
  {
    type: '冲锋枪',
    weapons: ['QCQ171', 'MP7', '勇士冲锋枪', 'SR-3M', 'SMG-45', '野牛冲锋枪', 'UZI', 'Vector', 'P90', 'MP5', 'MK4']
  },
  {
    type: '狙击步枪',
    weapons: ['M700', 'R93', 'SV-98', 'AWM', 'M82']
  },
  {
    type: '精确射手步枪',
    weapons: ['SVCH', 'M14', 'PSG-1', 'SVD', 'Mini-14', 'VSS', 'SR-25', 'SKS', 'Marlin杠杆步枪']
  },
  {
    type: '轻机枪',
    weapons: ['M250', 'PKM', 'QJB201', 'M249']
  },
  {
    type: '霰弹枪',
    weapons: ['S12K', 'M1014', '725双管霰弹枪', 'FS-12', 'M870']
  },
  {
    type: '手枪',
    weapons: ['93R', 'G18', '沙鹰', '左轮手枪', 'M1911']
  },
  {
    type: '特殊武器',
    weapons: ['复合弓']
  },
]

function buildGunCodeGroups() {
  return GUN_CODE_GROUPS.map((group) => ({
    ...group,
    weapons: group.weapons.map((weapon) => ({
      name: weapon,
      entries: GUN_CODE_ENTRIES[weapon] || []
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
