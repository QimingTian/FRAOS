import WeatherDashboard from '../components/weather/WeatherDashboard'

export function WeatherPage() {
  return (
    <div className="h-full min-h-0">
      {/* All Sky Cam disabled for Standard tier — restore AllSkyPersonalView when ASC is available */}
      {/* <AllSkyPersonalView /> */}
      <WeatherDashboard />
    </div>
  )
}
