/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      "replicate.delivery",
      "pbxt.replicate.delivery",
      "generativelanguage.googleapis.com",
    ],
  },
};

module.exports = nextConfig;
