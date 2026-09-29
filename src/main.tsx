import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { contentTree } from './content'
import { LanguageProvider } from './i18n/LanguageProvider'
import './index.css'
import { createRoutes } from './routes'

const router = createBrowserRouter(createRoutes(contentTree), { basename: import.meta.env.BASE_URL })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <RouterProvider router={router} />
    </LanguageProvider>
  </StrictMode>,
)
