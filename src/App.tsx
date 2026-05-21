import { useState } from 'react'
import type { FormEvent, KeyboardEvent, MouseEvent } from 'react'
import './App.css'
import art315Seats from './generated/art315Seats'

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
  width: number
  height: number
  hitWidth?: number
  hitHeight?: number
  wheelchair: boolean
}

type CalibrationPoint = {
  x: number
  y: number
}

type VenueConfig = {
  id: string
  title: string
  image: string
  width: number
  height: number
  stats: string[]
  seats: SeatPoint[]
  coordinateOffsetX?: number
  coordinateOffsetY?: number
}

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
const GA_Y = [322, 343, 365, 386, 407, 428, 449, 470, 491, 512, 533, 642]

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

const RA_X = [731, 729, 729, 729, 729, 729, 729, 750, 750, 750, 750, 731]
const RA_Y = [322, 343, 365, 386, 407, 428, 449, 470, 491, 512, 533, 642]

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
    width: 14,
    height: 14,
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
  return makeSerpentine('DA', 130, 517, 303, 18.9, 20.9)
}

const JINHAE_SEAT_POINTS = [...makeWing('GA', GA_ROWS, GA_X, GA_Y), ...makeNa(), ...makeDa(), ...makeWing('RA', RA_ROWS, RA_X, RA_Y)]

const VENUES: Record<string, VenueConfig> = {
  jinhae: {
    id: 'jinhae',
    title: '진해문화센터 공연장',
    image: 'jinhae-seating.jpg',
    width: VIEWBOX_WIDTH,
    height: VIEWBOX_HEIGHT,
    stats: ['객석 388석', '휠체어석 5석 + 보조석 2석'],
    seats: JINHAE_SEAT_POINTS,
  },
  art315: {
    id: 'art315',
    title: '3·15 아트센터 대극장',
    image: 'art315-seating-2x.jpg',
    width: 1000,
    height: 1141,
    coordinateOffsetX: -50,
    coordinateOffsetY: 0,
    stats: ['1층 834석', '2층 250석', '오케스트라박스 54석', '휠체어석 20석'],
    seats: art315Seats,
  },
}

function seatDisplayName(seatId: string, seatPointById: Record<string, SeatPoint>) {
  const seat = seatPointById[seatId]
  if (!seat) return seatId
  return `${seat.sectionName} ${seat.number}번`
}

function loadReservations(storageKey: string): Record<string, Reservation> {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function loadCalibration(calibrationKey: string): Record<string, CalibrationPoint> {
  try {
    const raw = localStorage.getItem(calibrationKey)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function App() {
  const params = new URLSearchParams(window.location.search)
  const requestedVenue = params.get('venue') === '315' || params.get('venue') === 'art315' ? 'art315' : 'jinhae'
  const venue = VENUES[requestedVenue]
  const storageKey = `bookingwang.reservations.${venue.id}.v1`
  const calibrationKey = `bookingwang.calibration.${venue.id}.v1`
  const seatPoints = venue.seats
  const seatPointById = Object.fromEntries(seatPoints.map((seat) => [seat.seatId, seat]))
  const seatSequence = seatPoints.map((seat) => seat.seatId)
  const [reservations, setReservations] = useState<Record<string, Reservation>>(() => loadReservations(storageKey))
  const [calibration, setCalibration] = useState<Record<string, CalibrationPoint>>(() => loadCalibration(calibrationKey))
  const [calibrationIndex, setCalibrationIndex] = useState(0)
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null)
  const [mapZoom, setMapZoom] = useState(() => (venue.id === 'art315' ? 2 : 1))
  const [form, setForm] = useState({ name: '', phone: '', note: '' })
  const [error, setError] = useState('')
  const [showAdmin, setShowAdmin] = useState(false)
  const seatingChartUrl = `${import.meta.env.BASE_URL}${venue.image}`
  const calibrationMode = new URLSearchParams(window.location.search).has('calibrate')

  const reservedCount = Object.keys(reservations).length
  const selectedReservation = selectedSeat ? reservations[selectedSeat] : undefined
  const currentCalibrationSeatId = seatSequence[calibrationIndex]
  const currentCalibrationSeat = currentCalibrationSeatId ? seatPointById[currentCalibrationSeatId] : undefined

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
    localStorage.setItem(storageKey, JSON.stringify(next))
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
    localStorage.setItem(calibrationKey, JSON.stringify(next))
  }

  function calibratedSeatPoint(seat: SeatPoint) {
    return calibration[seat.seatId] ?? {
      x: seat.x + (venue.coordinateOffsetX ?? 0),
      y: seat.y + (venue.coordinateOffsetY ?? 0),
    }
  }

  function mapEventPoint(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * venue.width,
      y: ((event.clientY - rect.top) / rect.height) * venue.height,
    }
  }

  function calibrateSeat(event: MouseEvent<SVGSVGElement>) {
    if (!calibrationMode || !currentCalibrationSeatId) return
    if (event.target instanceof SVGRectElement) return

    const { x, y } = mapEventPoint(event)
    const next = {
      ...calibration,
      [currentCalibrationSeatId]: {
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
      },
    }
    saveCalibration(next)
    setCalibrationIndex((value) => Math.min(value + 1, seatSequence.length - 1))
  }

  function selectNearestSeatFromMap(event: MouseEvent<SVGSVGElement>) {
    if (calibrationMode) {
      calibrateSeat(event)
      return
    }

    const { x, y } = mapEventPoint(event)
    const nearest = seatPoints.reduce<{ seatId: string, distance: number } | null>((best, seat) => {
      const point = calibratedSeatPoint(seat)
      const distance = Math.hypot(point.x - x, point.y - y)
      if (best && best.distance <= distance) return best
      return { seatId: seat.seatId, distance }
    }, null)

    const threshold = venue.id === 'art315' ? 32 : 24
    if (nearest && nearest.distance <= threshold) {
      selectSeat(nearest.seatId)
    }
  }

  function exportCalibration() {
    const blob = new Blob([JSON.stringify(calibration, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `bookingwang-${venue.id}-seat-calibration.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="app-shell">
      <section className="booking-panel" aria-label="BookingWang seat reservation">
        <div className="topbar">
          <div>
            <p className="eyebrow">BookingWang</p>
            <h1>{venue.title} 좌석 예약</h1>
          </div>
          <button type="button" className="ghost-button" onClick={() => setShowAdmin((value) => !value)}>
            {showAdmin ? '관리 숨기기' : '관리'}
          </button>
        </div>

        <div className="venue-switcher" aria-label="venue selector">
          <a className={venue.id === 'jinhae' ? 'active' : ''} href="?venue=jinhae">진해문화센터</a>
          <a className={venue.id === 'art315' ? 'active' : ''} href="?venue=315">3·15 아트센터</a>
        </div>

        <div className="status-strip" aria-label="reservation status">
          {venue.stats.map((stat) => <span key={stat}>{stat}</span>)}
          <span>{reservedCount} reserved</span>
        </div>

        <div className="map-toolbar" aria-label="seat map controls">
          {[1, 2, 4].map((zoom) => (
            <button
              key={zoom}
              type="button"
              className={mapZoom === zoom ? 'active' : ''}
              onClick={() => setMapZoom(zoom)}
            >
              {Math.round(zoom * 100)}%
            </button>
          ))}
        </div>

        <div className="venue-map" aria-label="seat map">
          <svg
            className={`venue-svg ${calibrationMode ? 'venue-svg-calibration' : ''}`}
            viewBox={`0 0 ${venue.width} ${venue.height}`}
            style={{ width: `${mapZoom * 100}%`, maxWidth: `${venue.width * mapZoom}px` }}
            role="img"
            aria-label={`${venue.title} 좌석 배치도`}
            onClick={selectNearestSeatFromMap}
          >
            <image href={seatingChartUrl} x="0" y="0" width={venue.width} height={venue.height} preserveAspectRatio="xMidYMid meet" />
            {seatPoints.map((seat) => {
              const status = seatStatus(seat.seatId)
              const point = calibratedSeatPoint(seat)
              const hitWidth = seat.hitWidth ?? Math.max(seat.width, venue.id === 'art315' ? 15 : 18)
              const hitHeight = seat.hitHeight ?? Math.max(seat.height, venue.id === 'art315' ? 15 : 18)
              return (
                <g
                  key={seat.seatId}
                  className={`svg-seat-group svg-seat-${status} ${seat.wheelchair ? 'svg-seat-wheelchair' : ''}`}
                >
                  <rect
                    className="svg-seat-target"
                    x={point.x - hitWidth / 2}
                    y={point.y - hitHeight / 2}
                    width={hitWidth}
                    height={hitHeight}
                    rx="3"
                    role="button"
                    tabIndex={0}
                    aria-label={`${seatDisplayName(seat.seatId, seatPointById)} ${status}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      selectSeat(seat.seatId)
                    }}
                    onKeyDown={(event) => selectSeatFromKeyboard(event, seat.seatId)}
                  />
                  <rect
                    className="svg-seat-visual"
                    x={point.x - seat.width / 2}
                    y={point.y - seat.height / 2}
                    width={seat.width}
                    height={seat.height}
                    rx="2"
                    aria-hidden="true"
                  />
                </g>
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
            <h2>{currentCalibrationSeat ? seatDisplayName(currentCalibrationSeat.seatId, seatPointById) : '완료'}</h2>
            <p className="muted">
              이미지에서 현재 좌석의 중심을 클릭하면 좌표가 저장되고 다음 좌석으로 넘어갑니다.
            </p>
            <div className="calibration-progress">
              {Object.keys(calibration).length} / {seatSequence.length} saved
            </div>
            <div className="calibration-actions">
              <button type="button" className="ghost-button" onClick={() => setCalibrationIndex((value) => Math.max(value - 1, 0))}>
                Prev
              </button>
              <button type="button" className="ghost-button" onClick={() => setCalibrationIndex((value) => Math.min(value + 1, seatSequence.length - 1))}>
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
          <h2>{selectedSeat ? seatDisplayName(selectedSeat, seatPointById) : 'Choose a seat'}</h2>
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
                      <strong>{seatDisplayName(reservation.seatId, seatPointById)}</strong>
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
