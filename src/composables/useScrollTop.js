import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useScrollTop() {
  const showScrollTopBtn = ref(false)

  function handleScroll() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
    showScrollTopBtn.value = scrollTop > 300
  }

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  onMounted(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', handleScroll)
  })

  return {
    showScrollTopBtn,
    handleScroll,
    scrollToTop
  }
}
