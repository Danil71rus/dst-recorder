import { createRouter, createWebHashHistory } from "vue-router"
import MainView from "../views/MainView.vue"
import TimerView from "../views/TimerView.vue"
import SelectAriaView from "../views/SelectAriaView.vue"

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
    {
        path: "/select-aria",
        name: "SelectAria",
        component: SelectAriaView,
    },
]

const router = createRouter({
    history: createWebHashHistory(),
    routes,
})

export default router
