import { createRoot } from "react-dom/client";
import App from "./App";

/* CSS Imports */
import "./styles/global.css";
import "./styles/responsive.css";
import "./styles/settings.css";
import "./styles/components/header.css";
import "./styles/components/auth.css";
import "./styles/components/sidebar.css";
import "./styles/components/chat.css";
import "./styles/components/input.css";
import "./styles/components/model.css";
import "./styles/components/tools.css";
import "./styles/components/diff.css";
import "./styles/components/extracting.css";
import "./styles/components/files.css";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
