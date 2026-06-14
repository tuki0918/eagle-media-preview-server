import iconOnUrl from "../../assets/icon_on.svg";
import { shellClasses } from "../shellClasses";

export function LoginView() {
  return (
    <section id="loginView" className={shellClasses.loginView}>
      <form id="connectForm" className={shellClasses.loginPanel}>
        <div className={shellClasses.loginHead}>
          <img className={shellClasses.appLogo} src={iconOnUrl} alt="" aria-hidden="true" />
          <h1>Media Preview Server</h1>
          <p className={shellClasses.loginText}>A local media server for your Eagle library.</p>
        </div>

        <div className="login-primary">
          <div className={shellClasses.formActions}>
            <button id="connectButton" className={shellClasses.connectButton} type="submit">
              <span>Connect</span>
            </button>
          </div>
        </div>
        <p id="connectMessage" className={shellClasses.connectMessage} aria-live="polite" />
      </form>
    </section>
  );
}
