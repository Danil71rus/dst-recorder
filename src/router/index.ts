import { createRouter, createWebHashHistory } from "vue-router"
import MainView from "../views/MainView.vue"
import TimerView from "../views/TimerView.vue"

const routes = [
    {
        path: "/",
        name: "Main",
        component: MainView,
    },
    {
        path: "/timer",
        name: "Timer",
        component: TimerView,
    },
]

const router = createRouter({
    history: createWebHashHistory(),
    routes,
})

export default router
