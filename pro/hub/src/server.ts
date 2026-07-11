import cors from 'cors'
import express from 'express'
import { hubPort } from './config.js'
import { mountImagingRoutes } from './imaging/routes.js'
import { startBackgroundReconcileLoop } from './imaging/reconcile.js'
import { mountPersonalRoutes } from './personal-routes.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, edition: 'personal', hub: 'embedded' })
})

const embeddedApi = express.Router()
mountImagingRoutes(embeddedApi, { requireAuth: true })
app.use('/api', embeddedApi)

mountPersonalRoutes(app)

app.listen(hubPort(), () => {
  console.log(`Borean Astro Personal Hub listening on http://127.0.0.1:${hubPort()}`)
  startBackgroundReconcileLoop()
})
