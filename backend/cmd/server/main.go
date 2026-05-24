package main

import (
	"context"
	"log"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/seosangjun/docflow/backend/internal/auth"
	"github.com/seosangjun/docflow/backend/internal/config"
	"github.com/seosangjun/docflow/backend/internal/handler"
	"github.com/seosangjun/docflow/backend/internal/middleware"
	"github.com/seosangjun/docflow/backend/internal/repository"
	"github.com/seosangjun/docflow/backend/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Run migrations
	m, err := migrate.New("file://db/migrations", cfg.DatabaseURL)
	if err != nil {
		log.Printf("Migration setup warning: %v", err)
	} else {
		if err := m.Up(); err != nil && err != migrate.ErrNoChange {
			log.Printf("Migration warning: %v", err)
		}
	}

	// Database connection
	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	queries := repository.New(pool)

	// JWT Manager
	jwtManager := auth.NewJWTManager(cfg.JWTSecret, cfg.AccessTokenExpiry, cfg.RefreshTokenExpiry)

	// Services
	authService := service.NewAuthService(queries, jwtManager)
	userService := service.NewUserService(queries)

	// Handlers
	authHandler := handler.NewAuthHandler(authService)
	userHandler := handler.NewUserHandler(userService)

	// Router
	r := gin.Default()
	r.Use(middleware.CORS(cfg.AllowedOrigins))
	r.Use(middleware.Logger())

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Public routes
	authGroup := r.Group("/api/auth")
	{
		authGroup.POST("/register", authHandler.Register)
		authGroup.POST("/login", middleware.RateLimit(5, time.Minute), authHandler.Login)
		authGroup.POST("/refresh", authHandler.Refresh)
	}

	// Authenticated routes
	api := r.Group("/api")
	api.Use(middleware.AuthMiddleware(jwtManager))
	{
		api.POST("/auth/logout", authHandler.Logout)

		// User routes
		api.GET("/users/me", userHandler.GetMe)
		api.PATCH("/users/me", userHandler.UpdateMe)
		api.PATCH("/users/me/password", userHandler.ChangePassword)

		// Admin-only routes
		admin := api.Group("")
		admin.Use(middleware.RequireRole("admin"))
		{
			admin.GET("/users", userHandler.ListUsers)
			admin.PATCH("/users/:id", userHandler.UpdateUserRole)
		}
	}

	log.Printf("Server starting on port %s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
