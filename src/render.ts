// Bootstrap CSS
import "bootstrap/dist/css/bootstrap.min.css"
import "bootstrap-vue-3/dist/bootstrap-vue-3.css"
import { createApp } from "vue"
import { createPinia } from "pinia"
import { createI18n } from "vue-i18n"
import { BootstrapVue3 } from "bootstrap-vue-3"
import App from "./App.vue"
import router from "./router"
import _ from "lodash"

// Импорт переводов
import en from "./locales/en.json"
import ru from "./locales/ru.json"

// Регистрируем lodash глобально
(window as any)._ = _

// Создание i18n
const i18n = createI18n({
    locale:         "ru", // Изменено с "en" на "ru"
    fallbackLocale: "ru", // Изменено с "en" на "ru"
    messages:       {
        en,
        ru,
    },
})

// Создание приложения
const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)
app.use(router)
app.use(BootstrapVue3)

// Добавляем lodash как глобальное свойство Vue
app.config.globalProperties.$_ = _

app.mount("#app")
