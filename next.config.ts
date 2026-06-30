import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    allowedDevOrigins: ["*.ptl1.dev", "localhost"],
    devIndicators: false,
    turbopack: {
        rules: {
            '*.mp4': {
                loaders: ["public/podcast"]
            }
        }
    }
};

export default nextConfig;
