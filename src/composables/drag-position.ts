
export const dragPosition = (exposed: string, customActionForStop?: unknown) => {
    /** Перемещение окна */
    let dragPosition: { x: number, y: number } | null = null
    function startDrag(e: MouseEvent) {
        dragPosition = { x: e.clientX, y: e.clientY }
        window.addEventListener("mousemove", drag)
        window.addEventListener("mouseup", stopDrag)
    }
    function drag(e: MouseEvent) {
        if (!dragPosition) return
        window.ipcRenderer?.send(exposed, {
            x: e.screenX - dragPosition.x,
            y: e.screenY - dragPosition.y,
        })
    }
    function stopDrag() {
        dragPosition = null
        window.removeEventListener("mousemove", drag)
        window.removeEventListener("mouseup", stopDrag)
        if (typeof customActionForStop === "function") customActionForStop()
    }

    return { startDrag }
}
