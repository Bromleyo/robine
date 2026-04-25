'use client'

import { useState, useEffect, useRef } from 'react'
import Icon from '@/components/ui/icon'

interface NotifItem {
  id: string
  type: string
  titre: string
  body?: string | null
  lu: boolean
  createdAt: string
  demande?: { id: string; reference: string } | null
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'À l\u2019instant'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

export default function NotificationBell() {
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotifItem[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void fetchUnreadCount()
    const interval = setInterval(() => void fetchUnreadCount(), 30_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function fetchUnreadCount() {
    const res = await fetch('/api/notifications?unread=true')
    if (res.ok) {
      const data = await res.json() as NotifItem[]
      setUnread(data.length)
    }
  }

  async function handleOpen() {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      const res = await fetch('/api/notifications')
      if (res.ok) setNotifications(await res.json() as NotifItem[])
      setLoading(false)
    }
  }

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' })
    setUnread(0)
    setNotifications(n => n.map(x => ({ ...x, lu: true })))
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => void handleOpen()}
        style={{
          position: 'relative',
          width: 32, height: 32, borderRadius: 'var(--r-sm)',
          display: 'grid', placeItems: 'center',
          color: 'var(--ink-500)', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 5, right: 5,
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--accent)', border: '1.5px solid var(--surface)',
          }} />
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50,
          width: 340, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
          boxShadow: '0 8px 24px rgba(0,0,0,.12)', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>
              Notifications{unread > 0 ? ` (${unread})` : ''}
            </span>
            {unread > 0 && (
              <button
                onClick={() => void markAllRead()}
                style={{ fontSize: 12, color: 'var(--ink-500)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Tout marquer lu
              </button>
            )}
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-400)' }}>
                Chargement…
              </div>
            )}
            {!loading && notifications.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-400)' }}>
                Aucune notification
              </div>
            )}
            {notifications.map(n => (
              <div
                key={n.id}
                style={{
                  padding: '10px 16px', borderBottom: '1px solid var(--border)',
                  background: n.lu ? 'none' : 'var(--surface-sunken)',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: n.lu ? 400 : 600, color: 'var(--ink-900)', flex: 1 }}>
                    {n.titre}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ink-400)', flexShrink: 0 }}>
                    {timeAgo(n.createdAt)}
                  </span>
                </div>
                {n.body && (
                  <span style={{ fontSize: 12, color: 'var(--ink-500)', lineHeight: 1.4 }}>{n.body}</span>
                )}
                {n.demande && (
                  <a
                    href={`/demandes/${n.demande.id}`}
                    style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
                  >
                    {n.demande.reference}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
