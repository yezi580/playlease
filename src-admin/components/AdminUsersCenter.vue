<template>
  <section class="page">
    <div class="panel">
      <div class="panel-head">
        <span>共 {{ users.length }} 条</span>
      </div>

      <div class="toolbar">
        <input
          v-model.trim="keyword"
          type="text"
          maxlength="50"
          class="toolbar-input"
          placeholder="搜索用户名或手机号"
          @keydown.enter.prevent="loadUsers"
        >
        <button type="button" class="row-btn" :disabled="loading" @click="loadUsers">
          {{ loading ? '搜索中...' : '搜索' }}
        </button>
        <button type="button" class="row-btn" :disabled="loading || !keyword" @click="resetSearch">
          重置
        </button>
      </div>

      <div v-if="error" class="state-card state-card--error">{{ error }}</div>
      <div v-else-if="loading" class="state-card">正在加载用户...</div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>用户名</th>
              <th>手机号</th>
              <th>角色</th>
              <th>封禁状态</th>
              <th>封禁天数</th>
              <th>封禁操作</th>
              <th>角色操作</th>
              <th>改名操作</th>
              <th>注册时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in users" :key="item.id">
              <td>{{ item.id }}</td>
              <td>
                <input
                  v-if="isSupportUser(item)"
                  v-model.trim="usernameDrafts[item.id]"
                  type="text"
                  maxlength="20"
                  class="username-input"
                  :disabled="Boolean(usernameSubmittingMap[item.id])"
                >
                <template v-else>{{ item.username }}</template>
              </td>
              <td>{{ item.phone }}</td>
              <td>
                <select
                  v-model="roleDrafts[item.id]"
                  class="role-select"
                  :disabled="Boolean(roleSubmittingMap[item.id])"
                >
                  <option v-for="role in roleOptions" :key="role.value" :value="role.value">
                    {{ role.label }}
                  </option>
                </select>
              </td>
              <td>
                <span
                  class="status-badge"
                  :class="isUserBanned(item) ? 'status-badge--danger' : 'status-badge--ok'"
                >
                  {{ formatBanStatus(item) }}
                </span>
              </td>
              <td>
                <input
                  v-model.number="banDaysDrafts[item.id]"
                  type="number"
                  min="1"
                  max="3650"
                  class="days-input"
                  :disabled="Boolean(banSubmittingMap[item.id])"
                >
              </td>
              <td class="row-actions">
                <button
                  v-if="canBanUser(item)"
                  type="button"
                  class="row-btn row-btn--danger"
                  @click="banUser(item)"
                >
                  {{ banSubmittingMap[item.id] ? '提交中...' : '封禁' }}
                </button>
                <button
                  v-if="item.banned_until"
                  type="button"
                  class="row-btn"
                  :disabled="Boolean(banSubmittingMap[item.id])"
                  @click="unbanUser(item)"
                >
                  解封
                </button>
              </td>
              <td>
                <button
                  v-if="shouldShowRoleSave(item)"
                  type="button"
                  class="row-btn"
                  :disabled="Boolean(roleSubmittingMap[item.id])"
                  @click="saveUserRole(item)"
                >
                  {{ roleSubmittingMap[item.id] ? '保存中...' : '保存' }}
                </button>
              </td>
              <td>
                <button
                  v-if="shouldShowUsernameSave(item)"
                  type="button"
                  class="row-btn"
                  :disabled="Boolean(usernameSubmittingMap[item.id])"
                  @click="saveUsername(item)"
                >
                  {{ usernameSubmittingMap[item.id] ? '保存中...' : '改名' }}
                </button>
              </td>
              <td>{{ formatDateTime(item.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="userRoleMessage" class="inline-message" :class="{ 'inline-message--error': userRoleMessageType === 'error' }">
        {{ userRoleMessage }}
      </p>
      <p v-if="userBanMessage" class="inline-message" :class="{ 'inline-message--error': userBanMessageType === 'error' }">
        {{ userBanMessage }}
      </p>
      <p v-if="usernameMessage" class="inline-message" :class="{ 'inline-message--error': usernameMessageType === 'error' }">
        {{ usernameMessage }}
      </p>
    </div>

    <AdminConfirmDialog
      :open="Boolean(pendingBanUser)"
      title="确认封禁用户"
      :message="banConfirmMessage"
      confirm-text="确认封禁"
      :loading="Boolean(pendingBanUser && banSubmittingMap[pendingBanUser.id])"
      danger
      @cancel="pendingBanUser = null"
      @confirm="confirmBanUser"
    />
    <AdminConfirmDialog
      :open="stepUpDialog.open"
      :title="stepUpDialog.title"
      :message="stepUpDialog.message"
      confirm-text="我知道了"
      @cancel="closeStepUpDialog"
      @confirm="closeStepUpDialog"
    />
  </section>
</template>

<script>
import {
  apiFetch,
  getStepUpRequirementMessage,
  getStepUpRequirementReason,
  isStepUpRequiredError,
  performAdminStepUp
} from '../utils/api.js'
import AdminConfirmDialog from './AdminConfirmDialog.vue'

const ROLE_OPTIONS = Object.freeze([
  { value: 'admin', label: '管理员' },
  { value: 'support', label: '客服' },
  { value: 'user', label: '普通用户' }
])

const ROLE_SORT_WEIGHT = Object.freeze({
  admin: 1,
  support: 2,
  user: 3
})

export default {
  name: 'AdminUsersCenter',
  components: {
    AdminConfirmDialog
  },
  props: {
    currentUser: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      loading: false,
      error: '',
      keyword: '',
      users: [],
      roleOptions: ROLE_OPTIONS,
      roleDrafts: {},
      roleSubmittingMap: {},
      banDaysDrafts: {},
      banSubmittingMap: {},
      pendingBanUser: null,
      stepUpDialog: {
        open: false,
        title: '请完成二次校验',
        message: ''
      },
      userRoleMessage: '',
      userRoleMessageType: 'success',
      userBanMessage: '',
      userBanMessageType: 'success',
      usernameDrafts: {},
      usernameSubmittingMap: {},
      usernameMessage: '',
      usernameMessageType: 'success'
    }
  },
  async mounted() {
    await this.loadUsers()
  },
  computed: {
    banConfirmMessage() {
      if (!this.pendingBanUser) return ''
      const days = Number(this.banDaysDrafts[this.pendingBanUser.id] || 0)
      return `确认将 ${this.pendingBanUser.username || '--'} 封禁 ${days} 天吗？此操作会立即影响该用户的后台与前台使用。`
    }
  },
  methods: {
    async loadUsers() {
      this.loading = true
      this.error = ''
      this.userRoleMessage = ''
      this.userBanMessage = ''
      this.usernameMessage = ''
      try {
        const params = new URLSearchParams({
          page: '1',
          pageSize: '20',
          keyword: this.keyword
        })
        const data = await apiFetch(`/api/admin/users?${params.toString()}`)
        this.users = this.sortUsers(Array.isArray(data.list) ? data.list : [])
        this.roleDrafts = this.users.reduce((acc, item) => {
          acc[item.id] = item.role
          return acc
        }, {})
        this.usernameDrafts = this.users.reduce((acc, item) => {
          acc[item.id] = item.username
          return acc
        }, {})
        this.banDaysDrafts = this.users.reduce((acc, item) => {
          acc[item.id] = this.banDaysDrafts[item.id] || 1
          return acc
        }, {})
      } catch (error) {
        this.error = error.message || '获取用户列表失败'
      } finally {
        this.loading = false
      }
    },
    resetSearch() {
      this.keyword = ''
      this.loadUsers()
    },
    shouldShowRoleSave(item) {
      const draftRole = this.roleDrafts[item.id]
      if (!draftRole) return false
      if (Boolean(this.roleSubmittingMap[item.id])) return true
      return String(draftRole) !== String(item.role)
    },
    isSupportUser(item) {
      return String(item?.role || '').trim() === 'support'
    },
    shouldShowUsernameSave(item) {
      if (!this.isSupportUser(item)) return false
      const draftUsername = this.usernameDrafts[item.id]
      if (draftUsername == null) return false
      if (Boolean(this.usernameSubmittingMap[item.id])) return true
      return String(draftUsername).trim() !== String(item.username || '')
    },
    isUserBanned(item) {
      if (!item?.banned_until) return false
      const date = new Date(item.banned_until)
      return !Number.isNaN(date.getTime()) && date.getTime() > Date.now()
    },
    formatBanStatus(item) {
      return this.isUserBanned(item) ? '封禁' : '正常'
    },
    canBanUser(item) {
      const days = Number(this.banDaysDrafts[item.id] || 0)
      if (Boolean(this.banSubmittingMap[item.id])) return false
      if (Number(item.id) === Number(this.currentUser?.id || 0)) return false
      if (String(item.role || '').trim() === 'admin') return false
      return Number.isInteger(days) && days >= 1 && days <= 3650
    },
    async saveUserRole(item) {
      const nextRole = String(this.roleDrafts[item.id] || '').trim()
      if (!nextRole || nextRole === String(item.role || '')) return

      this.roleSubmittingMap = {
        ...this.roleSubmittingMap,
        [item.id]: true
      }
      this.userRoleMessage = ''

      try {
        const data = await this.runProtectedAction('update_user_role', () => apiFetch(`/api/admin/users/${item.id}/role`, {
          method: 'PUT',
          body: JSON.stringify({ role: nextRole })
        }))
        const updatedUser = data.user || {}
        this.applyUpdatedUser(updatedUser)
        this.userRoleMessageType = 'success'
        this.userRoleMessage = `已将 ${updatedUser.username || item.username} 设置为 ${this.getRoleLabel(updatedUser.role || nextRole)}`
      } catch (error) {
        this.roleDrafts = {
          ...this.roleDrafts,
          [item.id]: item.role
        }
        this.userRoleMessageType = 'error'
        this.userRoleMessage = error.message || '更新用户角色失败'
      } finally {
        this.roleSubmittingMap = {
          ...this.roleSubmittingMap,
          [item.id]: false
        }
      }
    },
    async saveUsername(item) {
      if (!this.isSupportUser(item)) return
      const nextUsername = String(this.usernameDrafts[item.id] || '').trim()
      if (!nextUsername || nextUsername === String(item.username || '')) return
      if (nextUsername.length < 2 || nextUsername.length > 20) {
        this.usernameMessageType = 'error'
        this.usernameMessage = '用户名长度需在 2 到 20 个字符之间'
        return
      }

      this.usernameSubmittingMap = {
        ...this.usernameSubmittingMap,
        [item.id]: true
      }
      this.usernameMessage = ''

      try {
        const data = await apiFetch(`/api/admin/users/${item.id}/username`, {
          method: 'PUT',
          body: JSON.stringify({ username: nextUsername })
        })
        const updatedUser = data.user || {}
        this.applyUpdatedUser(updatedUser)
        this.usernameMessageType = 'success'
        this.usernameMessage = `已将用户 #${item.id} 的用户名改为 ${updatedUser.username || nextUsername}`
      } catch (error) {
        this.usernameDrafts = {
          ...this.usernameDrafts,
          [item.id]: item.username
        }
        this.usernameMessageType = 'error'
        this.usernameMessage = error.message || '更新用户名失败'
      } finally {
        this.usernameSubmittingMap = {
          ...this.usernameSubmittingMap,
          [item.id]: false
        }
      }
    },
    async banUser(item) {
      const days = Number(this.banDaysDrafts[item.id] || 0)
      if (!this.canBanUser(item)) return
      this.pendingBanUser = item
    },
    async confirmBanUser() {
      const item = this.pendingBanUser
      if (!item) return
      const days = Number(this.banDaysDrafts[item.id] || 0)
      if (!this.canBanUser(item)) {
        this.pendingBanUser = null
        return
      }

      this.banSubmittingMap = {
        ...this.banSubmittingMap,
        [item.id]: true
      }
      this.userBanMessage = ''

      try {
        const data = await this.runProtectedAction('ban_user', () => apiFetch(`/api/admin/users/${item.id}/ban`, {
          method: 'PUT',
          body: JSON.stringify({ days })
        }))
        const updatedUser = data.user || {}
        this.applyUpdatedUser(updatedUser)
        this.userBanMessageType = 'success'
        this.userBanMessage = `已将 ${updatedUser.username || item.username} 封禁 ${days} 天`
      } catch (error) {
        this.userBanMessageType = 'error'
        this.userBanMessage = error.message || '封禁用户失败'
      } finally {
        this.banSubmittingMap = {
          ...this.banSubmittingMap,
          [item.id]: false
        }
        this.pendingBanUser = null
      }
    },
    async unbanUser(item) {
      if (Boolean(this.banSubmittingMap[item.id]) || !item?.banned_until) return

      this.banSubmittingMap = {
        ...this.banSubmittingMap,
        [item.id]: true
      }
      this.userBanMessage = ''

      try {
        const data = await this.runProtectedAction('unban_user', () => apiFetch(`/api/admin/users/${item.id}/ban`, {
          method: 'DELETE'
        }))
        const updatedUser = data.user || {}
        this.applyUpdatedUser(updatedUser)
        this.userBanMessageType = 'success'
        this.userBanMessage = `已解除 ${updatedUser.username || item.username} 的封禁`
      } catch (error) {
        this.userBanMessageType = 'error'
        this.userBanMessage = error.message || '解除封禁失败'
      } finally {
        this.banSubmittingMap = {
          ...this.banSubmittingMap,
          [item.id]: false
        }
      }
    },
    applyUpdatedUser(updatedUser) {
      if (!updatedUser?.id) return
      this.users = this.sortUsers(this.users.map((user) => (
        Number(user.id) === Number(updatedUser.id)
          ? { ...user, ...updatedUser }
          : user
      )))
      this.roleDrafts = {
        ...this.roleDrafts,
        [updatedUser.id]: updatedUser.role || this.roleDrafts[updatedUser.id]
      }
      this.usernameDrafts = {
        ...this.usernameDrafts,
        [updatedUser.id]: updatedUser.username || this.usernameDrafts[updatedUser.id]
      }
      this.banDaysDrafts = {
        ...this.banDaysDrafts,
        [updatedUser.id]: this.banDaysDrafts[updatedUser.id] || 1
      }
    },
    sortUsers(list) {
      return [...list].sort((left, right) => {
        const leftWeight = ROLE_SORT_WEIGHT[String(left?.role || '').trim()] || 99
        const rightWeight = ROLE_SORT_WEIGHT[String(right?.role || '').trim()] || 99
        if (leftWeight !== rightWeight) {
          return leftWeight - rightWeight
        }
        return Number(right?.id || 0) - Number(left?.id || 0)
      })
    },
    getRoleLabel(role) {
      return this.roleOptions.find((item) => item.value === role)?.label || String(role || '--')
    },
    async runProtectedAction(action, requester) {
      try {
        return await requester()
      } catch (error) {
        if (!isStepUpRequiredError(error)) {
          throw error
        }
        if (getStepUpRequirementReason(error) === 'trusted_device_required') {
          throw new Error(getStepUpRequirementMessage(error))
        }

        try {
          await performAdminStepUp(action)
        } catch (stepUpError) {
          this.openStepUpDialog('二次校验未完成', stepUpError.message || 'Passkey 二次校验失败')
          throw stepUpError
        }

        return requester()
      }
    },
    openStepUpDialog(title, message) {
      this.stepUpDialog = {
        open: true,
        title,
        message
      }
    },
    closeStepUpDialog() {
      this.stepUpDialog = {
        open: false,
        title: '请完成二次校验',
        message: ''
      }
    },
    formatDateTime(value) {
      if (!value) return '--'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }
  }
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel,
.state-card {
  border-radius: 18px;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
}

.panel,
.state-card {
  padding: 20px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.panel-head span {
  color: #6b7280;
  font-size: 13px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.toolbar-input,
.role-select,
.days-input,
.username-input {
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
}

.toolbar-input {
  flex: 1;
}

.table-wrap {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 12px 10px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  white-space: nowrap;
  font-size: 14px;
}

.table th {
  color: #6b7280;
  font-weight: 600;
}

.row-btn {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #eff6ff;
  color: #1d4ed8;
}

.row-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.row-btn--danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.row-actions {
  display: flex;
  gap: 8px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.status-badge--ok {
  color: #047857;
  background: #d1fae5;
}

.status-badge--danger {
  color: #b91c1c;
  background: #fee2e2;
}

.days-input {
  width: 92px;
  min-height: 36px;
}

.username-input {
  width: 150px;
  min-height: 36px;
}

.inline-message {
  margin: 12px 0 0;
  color: #047857;
  font-size: 14px;
}

.inline-message--error,
.state-card--error {
  color: #b91c1c;
}

.state-card--error {
  border-color: #fecaca;
  background: #fff1f2;
  box-shadow: none;
}

@media (max-width: 960px) {
  .toolbar,
  .row-actions {
    flex-wrap: wrap;
  }
}
</style>
