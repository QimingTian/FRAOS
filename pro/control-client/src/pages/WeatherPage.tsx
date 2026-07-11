import AllSkyPersonalView from '../components/site/AllSkyPersonalView'
import WeatherDashboard from '../components/weather/WeatherDashboard'

export function WeatherPage() {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <AllSkyPersonalView />
      <WeatherDashboard />
    </div>
  )
}
