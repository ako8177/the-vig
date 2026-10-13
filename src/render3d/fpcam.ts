// The first-person camera (THREEJS-NOTES rule 2): yaw on the body, pitch on the camera, pitch
// clamped to ±70°, eye at 1.6 m on the sim's (interpolated) position. Seating eases the camera to
// the table's seat transform; standing eases it back. The look is local (it never waits on the
// sim); the walk direction it produces goes to the sim as a `move` command.
import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { EYE_H } from '../data/floors';

export const PITCH_LIMIT = (70 * Math.PI) / 180;
const EASE_S = 0.45;

const smooth = (t: number) => t * t * (3 - 2 * t);

export class FirstPerson {
  yaw = 0;
  pitch = -0.05;
  /** radians per CSS pixel of mouse movement */
  sensitivity = 0.0022;
  private ease = 1;
  private from = { p: new Vector3(), q: new Quaternion() };
  private to: { p: Vector3; q: Quaternion } | null = null;
  /** true while seated (or easing into the seat) */
  seated = false;

  look(dx: number, dy: number) {
    if (this.seated) return;
    this.yaw -= dx * this.sensitivity;
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch - dy * this.sensitivity));
  }

  /** World-space walk direction for forward/strafe input (each -1..1), in thousandths. */
  walk(fwd: number, strafe: number): { mx: number; mz: number } {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // yaw 0 looks down -Z; right is +X
    let x = -s * fwd + c * strafe;
    let z = -c * fwd - s * strafe;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { mx: Math.round(x * 1000), mz: Math.round(z * 1000) };
  }

  /** Ease into a seat: the camera goes to `eye` looking at `look`. */
  sit(cam: PerspectiveCamera, eye: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }) {
    this.from = { p: cam.position.clone(), q: cam.quaternion.clone() };
    const p = new Vector3(eye.x, eye.y, eye.z);
    const dir = new Vector3(look.x - eye.x, look.y - eye.y, look.z - eye.z).normalize();
    const q = new Quaternion().setFromEuler(new Euler(Math.asin(dir.y), Math.atan2(-dir.x, -dir.z), 0, 'YXZ'));
    this.to = { p, q };
    this.ease = 0;
    this.seated = true;
  }

  /** Ease back up to standing at (x, z), facing the way the seat faced. */
  stand(cam: PerspectiveCamera) {
    this.from = { p: cam.position.clone(), q: cam.quaternion.clone() };
    const e = new Euler().setFromQuaternion(cam.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, e.x));
    this.to = null;
    this.ease = 0;
    this.seated = false;
  }

  /** Place the camera for this frame. `x, z` is the body (interpolated sim position). */
  apply(cam: PerspectiveCamera, x: number, z: number, dt: number) {
    this.ease = Math.min(1, this.ease + dt / EASE_S);
    const t = smooth(this.ease);
    const bodyP = new Vector3(x, EYE_H, z);
    const bodyQ = new Quaternion().setFromEuler(new Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const goalP = this.to ? this.to.p : bodyP;
    const goalQ = this.to ? this.to.q : bodyQ;
    if (t >= 1) {
      cam.position.copy(goalP);
      cam.quaternion.copy(goalQ);
    } else {
      cam.position.lerpVectors(this.from.p, goalP, t);
      cam.quaternion.slerpQuaternions(this.from.q, goalQ, t);
    }
  }

  /** Snap with no easing (debug poses and screenshots). */
  snap(cam: PerspectiveCamera, x: number, z: number) {
    this.ease = 1;
    this.apply(cam, x, z, 0);
  }
}
