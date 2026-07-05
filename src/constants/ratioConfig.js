/**
 * 基础比例配置
 * 单位：万哈夫币/元
 * 后期可通过管理员后台动态修改
 */

export const BASE_RATIO_CONFIG = {
  // 九格配置
  grid9: {
    specialKnife: 40,    // 赤枭或怜悯
    otherKnife: 41,      // 其他刀皮
    noKnife: 42          // 无皮
  },
  // 六格配置
  grid6: {
    specialKnife: 42,    // 赤枭或怜悯
    otherKnife: 43,      // 其他刀皮
    noKnife: 44          // 无其他刀皮（无皮）
  }
}

// 特殊刀皮列表（影响基础比例）
export const SPECIAL_KNIVES = ['赤枭', '怜悯']

// 计算基础比例的辅助函数
export function calculateBaseRatio(gridSize, knifeSkin) {
  const config = gridSize === 9 ? BASE_RATIO_CONFIG.grid9 : BASE_RATIO_CONFIG.grid6
  
  // 判断刀皮类型
  const hasSpecial = SPECIAL_KNIVES.some(knife => knifeSkin?.includes(knife))
  const hasAnyKnife = knifeSkin && knifeSkin.length > 0
  
  if (hasSpecial) {
    return config.specialKnife
  } else if (hasAnyKnife) {
    return config.otherKnife
  } else {
    return config.noKnife
  }
}

// 导出完整配置（用于管理员后台）
export function getRatioConfig() {
  return {
    baseRatio: BASE_RATIO_CONFIG,
    specialKnives: [...SPECIAL_KNIVES]
  }
}

// 更新配置（管理员后台调用）
export function updateRatioConfig(newConfig) {
  // 实际应用中这里应该调用API保存到后端
  // 前端临时修改可以覆盖 BASE_RATIO_CONFIG
  Object.assign(BASE_RATIO_CONFIG, newConfig.baseRatio)
}
