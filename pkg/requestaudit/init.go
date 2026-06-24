package requestaudit

import (
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
)

var logDB *gorm.DB

func Init(db *gorm.DB) error {
	logDB = db
	if db == nil {
		return nil
	}
	if err := db.AutoMigrate(&RelayAuditRecord{}); err != nil {
		return fmt.Errorf("requestaudit: auto migrate: %w", err)
	}
	cfg := loadConfig()
	if cfg.Enabled {
		common.SysLog(fmt.Sprintf("requestaudit: enabled (max_body_kb=%d, sample_rate=%d%%, retention_days=%d)", cfg.MaxBodyKB, cfg.SampleRate, cfg.RetentionDays))
		if common.IsMasterNode && cfg.RetentionDays > 0 {
			startRetentionCleanup(cfg.RetentionDays)
		}
	}
	return nil
}

// startRetentionCleanup 启动后台留存清理：先清一次，之后每 24 小时清理一次过期记录。
func startRetentionCleanup(retentionDays int) {
	gopool.Go(func() {
		// 首次立即清理
		cutoff := time.Now().AddDate(0, 0, -retentionDays).Unix()
		if affected, err := DeleteOldRecords(logDB, cutoff); err != nil {
			common.SysError("requestaudit: retention cleanup error: " + err.Error())
		} else if affected > 0 {
			common.SysLog(fmt.Sprintf("requestaudit: retention cleanup removed %d records", affected))
		}

		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cutoff := time.Now().AddDate(0, 0, -retentionDays).Unix()
			if affected, err := DeleteOldRecords(logDB, cutoff); err != nil {
				common.SysError("requestaudit: retention cleanup error: " + err.Error())
			} else if affected > 0 {
				common.SysLog(fmt.Sprintf("requestaudit: retention cleanup removed %d records", affected))
			}
		}
	})
}
