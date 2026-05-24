package config

import (
	"time"

	"github.com/caarlos0/env/v11"
)

type Config struct {
	Port               string        `env:"PORT" envDefault:"8080"`
	DatabaseURL        string        `env:"DATABASE_URL,required"`
	JWTSecret          string        `env:"JWT_SECRET,required"`
	AccessTokenExpiry  time.Duration `env:"ACCESS_TOKEN_EXPIRY" envDefault:"1h"`
	RefreshTokenExpiry time.Duration `env:"REFRESH_TOKEN_EXPIRY" envDefault:"168h"`
	AllowedOrigins     string        `env:"ALLOWED_ORIGINS" envDefault:"http://localhost:3000"`
}

func Load() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}
