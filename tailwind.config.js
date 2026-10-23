/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        oled: "#000000",
        night: {
          red: "#ff3b30",
          dim: "#8b0000",
          bg: "#0a0000",
        },
      },
      minHeight: {
        touch: "48px",
      },
      minWidth: {
        touch: "48px",
      },
    },
  },
  plugins: [
    function nightModeVariant({ addVariant }) {
      addVariant("night-mode", ".night-mode &");
    },
  ],
};
