import { createRouter, createWebHashHistory } from "vue-router"
import MainView from "@/views/MainView.vue"
import TimerView from "@/views/TimerView.vue"
import SelectAriaView from "@/views/SelectAriaView.vue"
import BorderView from "@/views/BorderView.vue"
import CaptureView from "@/views/CaptureView.vue"
import CountdownView from "@/views/CountdownView.vue"
import RecordingPreviewView from "@/views/RecordingPreviewView.vue"

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
    {
        path: "/border",
        name: "Border",
        component: BorderView,
    },
    {
        path: "/capture",
        name: "Capture",
        component: CaptureView,
    },
    {
        path: "/countdown",
        name: "Countdown",
        component: CountdownView,
    },
    {
        path: "/recording-preview",
        name: "RecordingPreview",
        component: RecordingPreviewView,
    },
]

const router = createRouter({
    history: createWebHashHistory(),
    routes,
})

export default router
