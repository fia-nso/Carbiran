export function useWebNotifications() {
  const requestPermission = async () => {
    if (!('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }

  const showNotification = (title: string, body: string, onClick?: () => void) => {
    if (Notification.permission !== 'granted') return
    const notif = new Notification(title, {
      body,
      icon: '/LOGO.webp',
      badge: '/LOGO.webp',
      tag: 'carbiran-notif',
    })
    if (onClick) notif.onclick = onClick
  }

  return { requestPermission, showNotification }
}
