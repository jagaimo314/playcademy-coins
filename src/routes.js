import { createHomeView } from './views/home/home.view.js'
import { createLessonView } from './views/lesson/lesson.view.js'
import { createBakeryView } from './views/bakery/bakery.view.js'

/**
 * The route table. Guards return a redirect path, or nothing to allow through.
 */
export const routes = [
    {
        path: '/',
        title: 'Playcademy',
        view: createHomeView,
    },
    {
        path: '/lesson',
        title: 'Lesson \u00b7 Playcademy',
        view: createLessonView,
    },
    {
        path: '/bakery',
        title: 'Bake Sale \u00b7 Playcademy',
        view: createBakeryView,
        // Hosting a bakery is gated on finishing the lesson. Joining someone
        // else's bakery by code is not — an invited kid can always accept.
        guard: ({ store, params }) => {
            const isJoining = params.has('code')
            if (isJoining || store.get('lesson.completed')) return null
            return '/'
        },
    },
]
