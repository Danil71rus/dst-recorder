<template>
    <div id="app">
        <router-view />
    </div>
</template>


<style lang="scss">
@use '@/assets/styles/main.scss';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* Убираем фон по умолчанию для body и html */
html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    background-color: transparent; /* Самое важное правило! */
}

#app {
  width: 100%;
  height: 100vh;
}
</style>
