import Masthead from "../Masthead";
import { newTab, waLink } from "./whatsapp";

// The frame every blog page shares: the Navera mark, a centred column, and the
// same footer the order page ends with (WhatsApp button + FSSAI line). Server
// component, no JavaScript shipped.
export default function Shell({ waNumber, children }) {
  return (
    <main>
      <Masthead lede={false} />
      <div className="wrap">
        {children}

        <div className="foot">
          <a
            className="wa"
            href={waLink(waNumber, "Hi Navera, I have a question about your paneer.")}
            {...newTab}
          >
            Questions? WhatsApp us
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <p className="fssai">FSSAI Lic. No. 22426358000260</p>
        </div>
      </div>
    </main>
  );
}
