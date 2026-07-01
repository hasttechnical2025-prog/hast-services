export interface Coordinates {
  lat: number
  lng: number
}

// Hàm gọi Nominatim để lấy tọa độ từ địa chỉ (miễn phí, không cần API key)
export async function getCoordinatesFromAddress(address: string): Promise<Coordinates | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`,
      {
        headers: {
          'User-Agent': 'TechServiceApp/1.0', // Cần thiết để không bị block bởi Nominatim
        },
      }
    )

    if (!response.ok) return null

    const data = await response.json()
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      }
    }
    return null
  } catch (error) {
    console.error('Error fetching coordinates:', error)
    return null
  }
}

// Hàm gọi OSRM để tính khoảng cách đường bộ (km) từ điểm A đến điểm B
export async function calculateDistanceKM(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<number | null> {
  try {
    // OSRM API URL định dạng: {lng},{lat};{lng},{lat}
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`
    )

    if (!response.ok) return null

    const data = await response.json()
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      // OSRM trả về khoảng cách tính bằng mét, chia cho 1000 để ra km
      const distanceMeters = data.routes[0].distance
      return distanceMeters / 1000
    }
    return null
  } catch (error) {
    console.error('Error calculating distance:', error)
    return null
  }
}

// Hàm tiện ích: Tính khoảng cách từ điểm gốc (công ty) đến khách hàng
export async function getDistanceFromOffice(
  destLat: number,
  destLng: number
): Promise<number | null> {
  const OFFICE_LAT = 21.011681
  const OFFICE_LNG = 105.809180

  return calculateDistanceKM(OFFICE_LAT, OFFICE_LNG, destLat, destLng)
}
