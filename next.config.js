/** @type {import('next').NextConfig} */
const nextConfig = {
    devIndicators: false,
    typescript: {
        // was true: type errors never failed a deploy. The 13 old ones are
        // fixed, so a broken type now stops the build instead of reaching users.
        ignoreBuildErrors: false,
    },
    async headers() {
        return [{
            source: '/:path*',
            headers: [
                // Other sites can't show our pages in a frame (clickjacking)
                { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                // Only our own pages may ask for the camera and microphone
                { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
            ],
        }];
    },
};

module.exports = nextConfig;
