package requestaudit

import (
	"github.com/QuantumNous/new-api/common"
)

const (
	envEnabled       = "RELAY_AUDIT_ENABLED"
	envMaxBodyKB     = "RELAY_AUDIT_MAX_BODY_KB"
	envSampleRate    = "RELAY_AUDIT_SAMPLE_RATE"
	envIfUncached    = "RELAY_AUDIT_IF_UNCACHED"
	envRetentionDays = "RELAY_AUDIT_RETENTION_DAYS"
	defaultMaxBodyKB = 1024
	defaultRetention = 30
)

type config struct {
	Enabled       bool
	MaxBodyKB     int
	SampleRate    int // 0-100, percentage of requests to record
	IfUncached    bool
	RetentionDays int
}

func loadConfig() config {
	return config{
		Enabled:       common.GetEnvOrDefaultBool(envEnabled, false),
		MaxBodyKB:     common.GetEnvOrDefault(envMaxBodyKB, defaultMaxBodyKB),
		SampleRate:    common.GetEnvOrDefault(envSampleRate, 100),
		IfUncached:    common.GetEnvOrDefaultBool(envIfUncached, false),
		RetentionDays: common.GetEnvOrDefault(envRetentionDays, defaultRetention),
	}
}
