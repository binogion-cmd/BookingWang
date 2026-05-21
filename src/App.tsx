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

type SeatRow = {
  seats: number[]
  offset?: number
  gapAfter?: boolean
}

type SeatSection = {
  id: string
  name: string
  className: string
  count: number
  rows: SeatRow[]
  wheelchairSeats?: number[]
}

const STORAGE_KEY = 'bookingwang.reservations.v1'

function serpentineRows(start: number, end: number, columns: number): SeatRow[] {
  const rows: SeatRow[] = []
  for (let first = start; first <= end; first += columns) {
    const row = Array.from({ length: columns }, (_, index) => first + index).filter((seat) => seat <= end)
    rows.push({ seats: rows.length % 2 === 0 ? row : [...row].reverse() })
  }
  return rows
}

const GA_ROWS: SeatRow[] = [
  { seats: [1, 2], offset: 78 },
  { seats: [6, 5, 4, 3], offset: 58 },
  { seats: [7, 8, 9, 10, 11], offset: 42 },
  { seats: [17, 16, 15, 14, 13, 12], offset: 28 },
  { seats: [18, 19, 20, 21, 22, 23, 24], offset: 16 },
  { seats: [32, 31, 30, 29, 28, 27, 26, 25], offset: 6 },
  { seats: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42], offset: 0 },
  { seats: [51, 50, 49, 48, 47, 46, 45, 44, 43], offset: 0 },
  { seats: [52, 53, 54, 55, 56, 57, 58, 59, 60], offset: 10 },
  { seats: [66, 65, 64, 63, 62, 61], offset: 38 },
  { seats: [67, 68, 69], offset: 70 },
  { seats: [70], offset: 92, gapAfter: true },
]

const RA_ROWS: SeatRow[] = [
  { seats: [1, 2], offset: 0 },
  { seats: [6, 5, 4, 3], offset: 0 },
  { seats: [7, 8, 9, 10, 11], offset: 0 },
  { seats: [17, 16, 15, 14, 13, 12], offset: 0 },
  { seats: [18, 19, 20, 21, 22, 23, 24], offset: 0 },
  { seats: [32, 31, 30, 29, 28, 27, 26, 25], offset: 0 },
  { seats: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42], offset: 0 },
  { seats: [51, 50, 49, 48, 47, 46, 45, 44, 43], offset: 10 },
  { seats: [52, 53, 54, 55, 56, 57, 58, 59, 60], offset: 20 },
  { seats: [66, 65, 64, 63, 62, 61], offset: 44 },
  { seats: [67, 68, 69], offset: 42 },
  { seats: [70], offset: 14, gapAfter: true },
]

const SECTIONS: SeatSection[] = [
  { id: 'GA', name: '가열', className: 'section-left-wing', count: 70, rows: GA_ROWS },
  {
    id: 'NA',
    name: '나열',
    className: 'section-center-yellow',
    count: 125,
    rows: [...serpentineRows(1, 120, 10), { seats: [121, 122, 123, 124, 125] }],
    wheelchairSeats: [121, 122, 123, 124, 125],
  },
  { id: 'DA', name: '다열', className: 'section-center-blue', count: 130, rows: serpentineRows(1, 130, 10) },
  { id: 'RA', name: '라열', className: 'section-right-wing', count: 70, rows: RA_ROWS },
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
  const seatingChartUrl = `${import.meta.env.BASE_URL}jinhae-seating.jpg`

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

  function renderSectionChooser(section: SeatSection) {
    return (
      <div className="seat-picker-section" key={section.id}>
        <div className="picker-section-title">
          <strong>{section.name}</strong>
          <span>{section.count}석</span>
        </div>
        <div className="seat-picker-grid" style={{ '--columns': section.id === 'GA' || section.id === 'RA' ? 7 : 10 } as CSSProperties}>
          {Array.from({ length: section.count }, (_, index) => {
            const seatNumber = index + 1
            const seatId = buildSeatId(section, seatNumber)
            const status = seatStatus(seatId)
            const isWheelchair = section.wheelchairSeats?.includes(seatNumber) ?? false

            return (
              <button
                type="button"
                key={seatId}
                className={`seat-picker-button seat-${status} ${isWheelchair ? 'seat-wheelchair' : ''}`}
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
          <img className="venue-reference-image" src={seatingChartUrl} alt="진해문화센터 공연장 좌석 배치도" />
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

        <div className="card seat-picker-card">
          <p className="eyebrow">Seat Picker</p>
          <h2>좌석 번호 선택</h2>
          <div className="seat-picker-list">{SECTIONS.map(renderSectionChooser)}</div>
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
