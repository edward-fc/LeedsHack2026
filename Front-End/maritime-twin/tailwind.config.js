/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                sea: '#dcebf5',
                land: '#f0f0f0',
                route: '#004488',
                port: '#ff3300',
                chokepoint: '#000000',
            }
        },
    },
    plugins: [],
}
