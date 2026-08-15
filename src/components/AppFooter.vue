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
      <span class="divider">|</span>
      <div class="footer-police">
        <a
          href="https://beian.mps.gov.cn/#/query/webSearch?code=61070202000645"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="公安联网备案号：陕公网安备61070202000645号"
        >
          <img src="/police-badge.ico" alt="" aria-hidden="true">
          <span>陕公网安备61070202000645号</span>
        </a>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  padding: 24px 16px;
  background-color: transparent;
  color: var(--text-faint);
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
  color: var(--text-faint);
}

.footer-icp a {
  color: var(--text-faint);
  text-decoration: none;
  transition: color 0.2s;
}

.footer-police a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-faint);
  text-decoration: none;
  transition: color 0.2s;
}

.footer-police img {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  object-fit: contain;
}

.footer-icp a:hover {
  color: var(--text-muted);
  text-decoration: underline;
}

.footer-police a:hover {
  color: var(--text-muted);
  text-decoration: underline;
}

@media (max-width: 960px) {
  .app-footer {
    margin-top: 24px;
    padding-bottom: 24px;
    font-size: 12px;
  }
  
  .footer-content {
    gap: 8px 12px;
  }

  .divider {
    display: none;
  }
}
</style>
