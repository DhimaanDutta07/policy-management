"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Vercel serverless entry point
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const express_1 = __importDefault(require("express"));
const prismaClient_1 = __importDefault(require("../utils/prismaClient"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const routes_1 = __importDefault(require("../routes/routes"));
const GlobalErrorHandler_1 = require("../middlewares/GlobalErrorHandler");
const AuthMiddleware_1 = require("../middlewares/AuthMiddleware");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
function checkEnvironmentVariables() {
    const requiredEnvVariables = [
        "DATABASE_URL",
        "PORT",
        "NODE_ENV",
        "JWT_SECRET",
    ];
    const missingEnvVariables = requiredEnvVariables.filter((envVar) => !process.env[envVar]);
    if (missingEnvVariables.length) {
        throw new Error(`❌ Missing environment variables: ${missingEnvVariables.join(", ")}`);
    }
}
async function establishDatabaseConnection() {
    try {
        await prismaClient_1.default.$connect();
        console.log("✅ Database connection established");
    }
    catch (error) {
        console.error("❌ Database connection failed:", error);
        throw error;
    }
}
function setupMiddleware(app) {
    // File download endpoint
    app.get('/api/files/material-receipts/images/:fileName', (req, res) => {
        const fileName = req.params.fileName;
        const filePath = path_1.default.join(process.env.STORAGE_DIR || '/tmp', 'material-receipts', 'images', fileName);
        if (!fs_1.default.existsSync(filePath)) {
            console.log("File not found:", filePath);
            res.status(404).json({ error: "File not found" });
            return;
        }
        const contentType = 'application/octet-stream';
        res.set('X-Sendfile', filePath);
        res.set('Content-Type', contentType);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=31536000');
        res.set('Content-Disposition', `attachment; filename="${fileName}"`);
        res.end();
    });
    const origin = process.env.FRONTEND_API || process.env.LOCALHOST_API;
    app.use((0, cors_1.default)({
        origin: ["*", "https://insurewelladvisory.in", "https://policy.mindrops.com", "http://localhost:5173", "http://localhost:3001", "http://192.168.1.15:3001"],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization", "role"],
        credentials: true,
    }));
    app.use((0, helmet_1.default)({
        crossOriginResourcePolicy: { policy: "cross-origin" },
        crossOriginEmbedderPolicy: false
    }));
    app.set('trust proxy', 1);
    app.use(express_1.default.json({ limit: "10mb" }));
    app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
    const limiter = (0, express_rate_limit_1.default)({
        windowMs: 1 * 60 * 1000,
        max: 1000,
        validate: { xForwardedForHeader: false }
    });
    app.use(limiter);
    app.use((req, res, next) => {
        if (req.path.startsWith("/api/v1/auth") || req.path.startsWith("/api/v1/uploads")) {
            return next();
        }
        (0, AuthMiddleware_1.decodeJwt)(req, res, next);
    });
}
function setupRoutes(app) {
    app.get("/health", (req, res) => {
        res.status(200).json({ status: "healthy" });
    });
    let directory = path_1.default.join(__dirname, "..", "..", "purchase-orders");
    app.use("/files", express_1.default.static(directory));
    app.use("/api", routes_1.default);
    app.use((req, res) => {
        res.status(404).json({ error: "Route not found" });
    });
    app.use(GlobalErrorHandler_1.globalErrorHandler);
}
// Create and export Express app for Vercel
const app = (0, express_1.default)();
// Initialize app (will be called on first request)
let isInitialized = false;
async function initializeApp() {
    if (isInitialized)
        return;
    checkEnvironmentVariables();
    await establishDatabaseConnection();
    // Skip seed data in serverless environment to avoid issues
    // await seedData();
    setupMiddleware(app);
    setupRoutes(app);
    isInitialized = true;
}
// Export for Vercel
exports.default = async (req, res) => {
    await initializeApp();
    return app(req, res);
};
