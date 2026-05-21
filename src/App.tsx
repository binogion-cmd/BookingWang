import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import './App.css'

type SeatStatus = 'available' | 'selected' | 'reserved'

type Reservation = {
  seatId: string
  name: string
  phone: string
  note: string
  createdAt: string
}

type SeatSection = {
  id: string
  name: string
  floor: string
  className: string
  count: number
  columns: number
  wheelchairSeats?: number[]
  companionSeats?: number[]
}

const STORAGE_KEY = 'bookingwang.reservations.v1'

const SECTIONS: SeatSection[] = [
  { id: 'GA', name: '가열', floor: '진해문화센터 공연장', className: 'section-left-wing', count: 70, columns: 6 },
  {
    id: 'NA',
    name: '나열',
    floor: '진해문화센터 공연장',
    className: 'section-center-yellow',
    count: 125,
    columns: 10,
    wheelchairSeats: [121, 122, 123, 124, 125],
  },
  { id: 'DA', name: '다열', floor: '진해문화센터 공연장', className: 'section-center-blue', count: 130, columns: 10 },
  { id: 'RA', name: '라열', floor: '진해문화센터 공연장', className: 'section-right-wing', count: 70, columns: 6 },
]

function buildSeatId(section: SeatSection, seat: number) {
  return `${section.id}-${seat.toString().padStart(3, '0')}`
}

function seatDisplayName(seatId: string) {
  const [sectionId, number] = seatId.split('-')
  const section = SECTIONS.find((item) => item.id === sectionId)
  if (!section || !number) return seatId
  return `${section.name} ${Number(number)}번`
}

function loadReservations(): Record<string, Reservation> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function App() {
  const [reservations, setReservations] = useState<Record<string, Reservation>>(loadReservations)
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', note: '' })
  const [error, setError] = useState('')
  const [showAdmin, setShowAdmin] = useState(false)

  const reservedCount = Object.keys(reservations).length
  const selectedReservation = selectedSeat ? reservations[selectedSeat] : undefined

  function seatStatus(seatId: string): SeatStatus {
    if (reservations[seatId]) return 'reserved'
    if (selectedSeat === seatId) return 'selected'
    return 'available'
  }

  function selectSeat(seatId: string) {
    setSelectedSeat(seatId)
    setError('')
    const existing = reservations[seatId]
    setForm({
      name: existing?.name ?? '',
      phone: existing?.phone ?? '',
      note: existing?.note ?? '',
    })
  }

  function persist(next: Record<string, Reservation>) {
    setReservations(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function reserveSeat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedSeat) return

    const name = form.name.trim()
    const phone = form.phone.trim()
    const note = form.note.trim()

    if (reservations[selectedSeat]) {
      setError('이미 예약된 좌석입니다. 관리자에서 취소 후 다시 예약하세요.')
      return
    }
    if (name.length < 2) {
      setError('이름을 2글자 이상 입력하세요.')
      return
    }
    if (phone.replace(/\D/g, '').length < 8) {
      setError('연락 가능한 전화번호를 입력하세요.')
      return
    }

    persist({
      ...reservations,
      [selectedSeat]: {
        seatId: selectedSeat,
        name,
        phone,
        note,
        createdAt: new Date().toISOString(),
      },
    })
    setError('')
  }

  function cancelReservation(seatId: string) {
    const next = { ...reservations }
    delete next[seatId]
    persist(next)
    if (selectedSeat === seatId) {
      setSelectedSeat(null)
      setForm({ name: '', phone: '', note: '' })
    }
  }

  function clearAll() {
    if (!window.confirm('모든 예약을 초기화할까요?')) return
    persist({})
    setSelectedSeat(null)
    setForm({ name: '', phone: '', note: '' })
  }

  function exportReservations() {
    const blob = new Blob([JSON.stringify(Object.values(reservations), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `bookingwang-reservations-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function renderSection(section: SeatSection) {
    return (
      <div className={`seat-section ${section.className}`} key={section.id}>
        <div className="section-title">
          <strong>{section.name}</strong>
          <span>{section.count}석</span>
        </div>
        <div className="section-seats" style={{ '--columns': section.columns } as CSSProperties}>
          {Array.from({ length: section.count }, (_, index) => {
            const seatNumber = index + 1
            const seatId = buildSeatId(section, seatNumber)
            const status = seatStatus(seatId)
            const isWheelchair = section.wheelchairSeats?.includes(seatNumber) ?? false
            const isCompanion = section.companionSeats?.includes(seatNumber) ?? false

            return (
              <button
                type="button"
                key={seatId}
                className={`seat seat-${status} ${isWheelchair ? 'seat-wheelchair' : ''} ${isCompanion ? 'seat-companion' : ''}`}
                onClick={() => selectSeat(seatId)}
                aria-pressed={selectedSeat === seatId}
                aria-label={`${seatDisplayName(seatId)} ${status}`}
                title={seatDisplayName(seatId)}
              >
                {isWheelchair ? '♿' : seatNumber}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <main className="app-shell">
      <section className="booking-panel" aria-label="BookingWang seat reservation">
        <div className="topbar">
          <div>
            <p className="eyebrow">BookingWang</p>
            <h1>진해문화센터 공연장 좌석 예약</h1>
          </div>
          <button type="button" className="ghost-button" onClick={() => setShowAdmin((value) => !value)}>
            {showAdmin ? '관리 숨기기' : '관리'}
          </button>
        </div>

        <div className="status-strip" aria-label="reservation status">
          <span>객석 388석</span>
          <span>휠체어석 5석 + 보조석 2석</span>
          <span>{reservedCount} reserved</span>
        </div>

        <div className="venue-map" aria-label="seat map">
          <div className="stage">STAGE</div>
          <div className="auditorium-grid">{SECTIONS.map(renderSection)}</div>
        </div>

        <div className="legend">
          <span><i className="dot available-dot" />Available</span>
          <span><i className="dot yellow-dot" />Center</span>
          <span><i className="dot selected-dot" />Selected</span>
          <span><i className="dot reserved-dot" />Reserved</span>
          <span><i className="dot wheelchair-dot" />Wheelchair</span>
        </div>
      </section>

      <aside className="side-panel" aria-label="reservation form">
        <div className="card">
          <p className="eyebrow">Selected Seat</p>
          <h2>{selectedSeat ? seatDisplayName(selectedSeat) : 'Choose a seat'}</h2>
          {selectedSeat ? (
            selectedReservation ? (
              <div className="reservation-details">
                <p><strong>Name</strong><span>{selectedReservation.name}</span></p>
                <p><strong>Phone</strong><span>{selectedReservation.phone}</span></p>
                {selectedReservation.note && <p><strong>Note</strong><span>{selectedReservation.note}</span></p>}
                <button type="button" className="danger-button" onClick={() => cancelReservation(selectedSeat)}>
                  Cancel Reservation
                </button>
              </div>
            ) : (
              <form className="reservation-form" onSubmit={reserveSeat}>
                <label>
                  Name
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="예약자 이름"
                    autoComplete="name"
                  />
                </label>
                <label>
                  Contact
                  <input
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    placeholder="010-0000-0000"
                    autoComplete="tel"
                  />
                </label>
                <label>
                  Memo
                  <textarea
                    value={form.note}
                    onChange={(event) => setForm({ ...form, note: event.target.value })}
                    placeholder="요청 사항"
                    rows={3}
                  />
                </label>
                {error && <p className="form-error">{error}</p>}
                <button type="submit" className="primary-button">Reserve Seat</button>
              </form>
            )
          ) : (
            <p className="muted">좌석을 클릭하면 예약 입력창이 열립니다.</p>
          )}
        </div>

        {showAdmin && (
          <div className="card admin-card">
            <div className="admin-heading">
              <div>
                <p className="eyebrow">Admin</p>
                <h2>Reservations</h2>
              </div>
              <button type="button" className="ghost-button" onClick={exportReservations}>
                Export
              </button>
            </div>
            <div className="reservation-list">
              {Object.values(reservations).length === 0 ? (
                <p className="muted">예약 내역이 없습니다.</p>
              ) : (
                Object.values(reservations).map((reservation) => (
                  <div className="reservation-item" key={reservation.seatId}>
                    <div>
                      <strong>{seatDisplayName(reservation.seatId)}</strong>
                      <span>{reservation.name} · {reservation.phone}</span>
                    </div>
                    <button type="button" onClick={() => cancelReservation(reservation.seatId)}>
                      Cancel
                    </button>
                  </div>
                ))
              )}
            </div>
            <button type="button" className="danger-button" onClick={clearAll}>
              Clear All
            </button>
          </div>
        )}
      </aside>
    </main>
  )
}

export default App
