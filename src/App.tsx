import { useState } from 'react'
import type { FormEvent, KeyboardEvent, MouseEvent } from 'react'
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
  count: number
  wheelchairSeats?: number[]
}

type SeatPoint = {
  seatId: string
  sectionId: string
  sectionName: string
  number: number
  x: number
  y: number
  wheelchair: boolean
}

type CalibrationPoint = {
  x: number
  y: number
}

const STORAGE_KEY = 'bookingwang.reservations.v1'
const CALIBRATION_KEY = 'bookingwang.calibration.v1'
const VIEWBOX_WIDTH = 1000
const VIEWBOX_HEIGHT = 756

const SECTIONS: SeatSection[] = [
  { id: 'GA', name: '가열', count: 70 },
  { id: 'NA', name: '나열', count: 125, wheelchairSeats: [121, 122, 123, 124, 125] },
  { id: 'DA', name: '다열', count: 130 },
  { id: 'RA', name: '라열', count: 70 },
]

const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((section) => [section.id, section]))

const GA_ROWS = [
  [1, 2],
  [6, 5, 4, 3],
  [7, 8, 9, 10, 11],
  [17, 16, 15, 14, 13, 12],
  [18, 19, 20, 21, 22, 23, 24],
  [32, 31, 30, 29, 28, 27, 26, 25],
  [33, 34, 35, 36, 37, 38, 39, 40, 41, 42],
  [51, 50, 49, 48, 47, 46, 45, 44, 43],
  [52, 53, 54, 55, 56, 57, 58, 59, 60],
  [66, 65, 64, 63, 62, 61],
  [67, 68, 69],
  [70],
]

const GA_X = [227, 207, 189, 168, 149, 130, 111, 93, 93, 151, 170, 234]
const GA_Y = [265, 325, 345, 365, 385, 407, 427, 449, 470, 491, 512, 637]

const RA_ROWS = [
  [1, 2],
  [6, 5, 4, 3],
  [7, 8, 9, 10, 11],
  [17, 16, 15, 14, 13, 12],
  [18, 19, 20, 21, 22, 23, 24],
  [32, 31, 30, 29, 28, 27, 26, 25],
  [33, 34, 35, 36, 37, 38, 39, 40, 41, 42],
  [51, 50, 49, 48, 47, 46, 45, 44, 43],
  [52, 53, 54, 55, 56, 57, 58, 59, 60],
  [66, 65, 64, 63, 62, 61],
  [67, 68, 69],
  [70],
]

const RA_X = [742, 732, 732, 732, 732, 732, 732, 751, 751, 751, 751, 731]
const RA_Y = [265, 325, 344, 365, 385, 406, 426, 448, 470, 491, 511, 637]

function buildSeatId(sectionId: string, seat: number) {
  return `${sectionId}-${seat.toString().padStart(3, '0')}`
}

function makePoint(sectionId: string, seat: number, x: number, y: number): SeatPoint {
  const section = SECTION_BY_ID[sectionId]
  return {
    seatId: buildSeatId(sectionId, seat),
    sectionId,
    sectionName: section.name,
    number: seat,
    x,
    y,
    wheelchair: section.wheelchairSeats?.includes(seat) ?? false,
  }
}

function makeWing(sectionId: string, rows: number[][], starts: number[], yValues: number[]) {
  return rows.flatMap((row, rowIndex) =>
    row.map((seat, seatIndex) => makePoint(sectionId, seat, starts[rowIndex] + seatIndex * 19, yValues[rowIndex])),
  )
}

function makeSerpentine(sectionId: string, count: number, x: number, y: number, dx: number, dy: number, columns = 10) {
  const points: SeatPoint[] = []
  for (let seat = 1; seat <= count; seat += columns) {
    const rowIndex = Math.floor((seat - 1) / columns)
    const rowSeats = Array.from({ length: Math.min(columns, count - seat + 1) }, (_, index) => seat + index)
    const visualSeats = rowIndex % 2 === 0 ? rowSeats : [...rowSeats].reverse()

    visualSeats.forEach((seatNumber, visualIndex) => {
      points.push(makePoint(sectionId, seatNumber, x + visualIndex * dx, y + rowIndex * dy))
    })
  }
  return points
}

function makeNa() {
  const main = makeSerpentine('NA', 120, 309, 303, 18.9, 20.9)
  const wheelchairs = [121, 122, 123, 124, 125].map((seat, index) => makePoint('NA', seat, 314 + index * 29.8, 553))
  return [...main, ...wheelchairs]
}

function makeDa() {
  return makeSerpentine('DA', 130, 517, 282, 18.9, 20.9)
}

const SEAT_POINTS = [...makeWing('GA', GA_ROWS, GA_X, GA_Y), ...makeNa(), ...makeDa(), ...makeWing('RA', RA_ROWS, RA_X, RA_Y)]

const SEAT_POINT_BY_ID = Object.fromEntries(SEAT_POINTS.map((seat) => [seat.seatId, seat]))
const SEAT_SEQUENCE = SEAT_POINTS.map((seat) => seat.seatId)

function seatDisplayName(seatId: string) {
  const seat = SEAT_POINT_BY_ID[seatId]
  if (!seat) return seatId
  return `${seat.sectionName} ${seat.number}번`
}

function loadReservations(): Record<string, Reservation> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function loadCalibration(): Record<string, CalibrationPoint> {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function App() {
  const [reservations, setReservations] = useState<Record<string, Reservation>>(loadReservations)
  const [calibration, setCalibration] = useState<Record<string, CalibrationPoint>>(loadCalibration)
  const [calibrationIndex, setCalibrationIndex] = useState(0)
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', note: '' })
  const [error, setError] = useState('')
  const [showAdmin, setShowAdmin] = useState(false)
  const seatingChartUrl = `${import.meta.env.BASE_URL}jinhae-seating.jpg`
  const calibrationMode = new URLSearchParams(window.location.search).has('calibrate')

  const reservedCount = Object.keys(reservations).length
  const selectedReservation = selectedSeat ? reservations[selectedSeat] : undefined
  const currentCalibrationSeatId = SEAT_SEQUENCE[calibrationIndex]
  const currentCalibrationSeat = currentCalibrationSeatId ? SEAT_POINT_BY_ID[currentCalibrationSeatId] : undefined

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

  function selectSeatFromKeyboard(event: KeyboardEvent<SVGRectElement>, seatId: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    selectSeat(seatId)
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

  function saveCalibration(next: Record<string, CalibrationPoint>) {
    setCalibration(next)
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(next))
  }

  function calibratedSeatPoint(seat: SeatPoint) {
    return calibration[seat.seatId] ?? { x: seat.x, y: seat.y }
  }

  function calibrateSeat(event: MouseEvent<SVGSVGElement>) {
    if (!calibrationMode || !currentCalibrationSeatId) return
    if (event.target instanceof SVGRectElement) return

    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH
    const y = ((event.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT
    const next = {
      ...calibration,
      [currentCalibrationSeatId]: {
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
      },
    }
    saveCalibration(next)
    setCalibrationIndex((value) => Math.min(value + 1, SEAT_SEQUENCE.length - 1))
  }

  function exportCalibration() {
    const blob = new Blob([JSON.stringify(calibration, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'bookingwang-seat-calibration.json'
    anchor.click()
    URL.revokeObjectURL(url)
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
          <svg
            className={`venue-svg ${calibrationMode ? 'venue-svg-calibration' : ''}`}
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            role="img"
            aria-label="진해문화센터 공연장 좌석 배치도"
            onClick={calibrateSeat}
          >
            <image href={seatingChartUrl} x="0" y="0" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} preserveAspectRatio="xMidYMid meet" />
            {SEAT_POINTS.map((seat) => {
              const status = seatStatus(seat.seatId)
              const point = calibratedSeatPoint(seat)
              return (
                <rect
                  key={seat.seatId}
                  className={`svg-seat svg-seat-${status} ${seat.wheelchair ? 'svg-seat-wheelchair' : ''}`}
                  x={point.x - 7}
                  y={point.y - 7}
                  width="14"
                  height="14"
                  rx="2"
                  role="button"
                  tabIndex={0}
                  aria-label={`${seatDisplayName(seat.seatId)} ${status}`}
                  onClick={() => selectSeat(seat.seatId)}
                  onKeyDown={(event) => selectSeatFromKeyboard(event, seat.seatId)}
                />
              )
            })}
          </svg>
        </div>

        <div className="legend">
          <span><i className="dot available-dot" />Available</span>
          <span><i className="dot selected-dot" />Selected</span>
          <span><i className="dot reserved-dot" />Reserved</span>
          <span><i className="dot wheelchair-dot" />Wheelchair</span>
        </div>
      </section>

      <aside className="side-panel" aria-label="reservation form">
        {calibrationMode && (
          <div className="card calibration-card">
            <p className="eyebrow">Calibration</p>
            <h2>{currentCalibrationSeat ? seatDisplayName(currentCalibrationSeat.seatId) : '완료'}</h2>
            <p className="muted">
              이미지에서 현재 좌석의 중심을 클릭하면 좌표가 저장되고 다음 좌석으로 넘어갑니다.
            </p>
            <div className="calibration-progress">
              {Object.keys(calibration).length} / {SEAT_SEQUENCE.length} saved
            </div>
            <div className="calibration-actions">
              <button type="button" className="ghost-button" onClick={() => setCalibrationIndex((value) => Math.max(value - 1, 0))}>
                Prev
              </button>
              <button type="button" className="ghost-button" onClick={() => setCalibrationIndex((value) => Math.min(value + 1, SEAT_SEQUENCE.length - 1))}>
                Next
              </button>
              <button type="button" className="ghost-button" onClick={exportCalibration}>
                Export
              </button>
            </div>
          </div>
        )}

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
