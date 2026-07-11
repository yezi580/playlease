<template>
  <footer class="app-footer">
    <div class="footer-content">
      <div class="footer-info">
        <span>© 2026 汉中西游星泽网络科技有限公司</span>
      </div>
      <span class="divider">|</span>
      <div class="footer-icp">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
          陕ICP备2026014619号-1
        </a>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  padding: 24px 16px;
  background-color: transparent;
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
  margin-top: 40px;
}

.footer-content {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 12px;
}

.footer-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.divider {
  color: #cbd5e1;
}

.footer-icp a {
  color: #94a3b8;
  text-decoration: none;
  transition: color 0.2s;
}

.footer-icp a:hover {
  color: #64748b;
  text-decoration: underline;
}

@media (max-width: 960px) {
  .app-footer {
    margin-top: 24px;
    padding-bottom: 24px;
    font-size: 12px;
  }
  
  .divider {
    display: none;
  }
}
</style>
