/** Keyboard and multi-touch input. No rendering or tennis rules live here. */
export class GameControls {
  constructor({ enabled, isManual, onAction, onMovement, stick, buttons }) {
    Object.assign(this, { enabled, isManual, onAction, onMovement, stick });
    this.keys = new Set();
    this.joystick = { x: 0, z: 0 };
    this.pointer = null;
    document.addEventListener('keydown', event => this.keyDown(event));
    document.addEventListener('keyup', event => this.keyUp(event));
    stick.addEventListener('pointerdown', event => {
      if (!this.enabled() || !this.isManual() || this.pointer !== null || event.button !== 0) return;
      event.preventDefault(); this.pointer = event.pointerId;
      stick.setPointerCapture(event.pointerId); this.drag(event);
    });
    stick.addEventListener('pointermove', event => { if (event.pointerId === this.pointer) this.drag(event); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, event => {
      if (event.pointerId !== this.pointer) return;
      this.pointer = null; this.joystick = { x: 0, z: 0 };
      stick.querySelector('.stick-thumb').style.transform = 'translate(0px, 0px)';
      this.emitMovement();
    });
    buttons.forEach(button => {
      // Act on finger-down, not finger-up: tennis timing must not wait for a tap release.
      button.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !this.enabled()) return;
        event.preventDefault(); this.onAction(button.dataset.input);
      });
      // Keyboard/assistive activation remains supported without duplicating touch clicks.
      button.addEventListener('click', event => {
        if (event.detail === 0 && this.enabled()) this.onAction(button.dataset.input);
      });
    });
  }
  keyDown(event) {
    if (!this.enabled()) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
      if (!this.isManual()) return;
      event.preventDefault(); this.keys.add(event.code); this.emitMovement(); return;
    }
    const action = { Space: 'hit', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'deep', ArrowDown: 'short' }[event.code];
    if (!action) return;
    event.preventDefault();
    this.keys.add(event.code);
    if (!event.repeat) this.onAction(action);
  }
  keyUp(event) {
    if (!this.keys.delete(event.code)) return;
    this.emitMovement();
    if (this.enabled() && ['ArrowLeft', 'ArrowRight'].includes(event.code)) {
      this.onAction(this.keys.has('ArrowLeft') ? 'left' : this.keys.has('ArrowRight') ? 'right' : 'center');
    }
  }
  emitMovement() {
    this.onMovement((this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + this.joystick.x,
      (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0) + this.joystick.z);
  }
  drag(event) {
    const bounds = this.stick.getBoundingClientRect();
    const radius = bounds.width * .32;
    let x = (event.clientX - bounds.left - bounds.width / 2) / radius;
    let z = (event.clientY - bounds.top - bounds.height / 2) / radius;
    const length = Math.hypot(x, z);
    if (length < .12) { x = 0; z = 0; }
    else if (length > 1) { x /= length; z /= length; }
    this.joystick = { x, z };
    this.stick.querySelector('.stick-thumb').style.transform = `translate(${x * radius}px, ${z * radius}px)`;
    this.emitMovement();
  }
  reset() {
    const pointer = this.pointer; this.pointer = null;
    if (pointer !== null && this.stick.hasPointerCapture(pointer)) this.stick.releasePointerCapture(pointer);
    this.keys.clear(); this.joystick = { x: 0, z: 0 };
    this.stick.querySelector('.stick-thumb').style.transform = 'translate(0px, 0px)';
    this.onMovement(0, 0);
  }
}
