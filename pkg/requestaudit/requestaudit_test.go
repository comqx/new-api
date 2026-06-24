package requestaudit

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestShouldSampleStable(t *testing.T) {
	id := "20260526013754192623098268d9d6M5ecz1Xo"
	a := shouldSample(id, 50)
	b := shouldSample(id, 50)
	if a != b {
		t.Fatalf("expected stable sample decision, got %v then %v", a, b)
	}
}

func TestSaveRecordAndJoinByRequestId(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&RelayAuditRecord{}); err != nil {
		t.Fatal(err)
	}

	rid := "test-request-id-join"
	body := `{"model":"gpt-4","max_tokens":98304}`
	rec := &RelayAuditRecord{
		RequestId:   rid,
		Method:      "POST",
		Path:        "/v1/chat/completions",
		ClientIp:    "127.0.0.1",
		ContentType: "application/json",
		Body:        body,
		BodySize:    len(body),
		CreatedAt:   time.Now().Unix(),
	}
	if err := saveRecord(db, rec); err != nil {
		t.Fatal(err)
	}

	var loaded RelayAuditRecord
	if err := db.Where("request_id = ?", rid).First(&loaded).Error; err != nil {
		t.Fatal(err)
	}
	if loaded.Body != body {
		t.Fatalf("body mismatch: got %q", loaded.Body)
	}
}

// TestGetSelfRecordByRequestId_EnforcesOwnership 验证 self 接口的核心安全契约：
// 用户只能读取自己的审计记录，用别人的 request_id 查询必须返回 not found，
// 防止通过 request_id 越权读取他人的请求内容。
func TestGetSelfRecordByRequestId_EnforcesOwnership(t *testing.T) {
	gin.SetMode(gin.TestMode)

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&RelayAuditRecord{}, &model.User{}))

	// 包级依赖：详情接口经 usernameFor -> model.GetUsernameById 读 model.DB。
	// 测试环境无 Redis，关闭缓存路径，强制直接读 DB。
	prevRedis := common.RedisEnabled
	common.RedisEnabled = false
	logDB = db
	model.DB = db
	t.Cleanup(func() {
		logDB = nil
		model.DB = nil
		common.RedisEnabled = prevRedis
	})

	const ownerID, otherID = 11, 22
	rid := "rid-owned-by-11"
	require.NoError(t, saveRecord(db, &RelayAuditRecord{
		RequestId: rid,
		UserId:    ownerID,
		Body:      `{"model":"gpt-4"}`,
		CreatedAt: time.Now().Unix(),
	}))

	call := func(userID int) (bool, int) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set("id", userID)
		c.Params = gin.Params{{Key: "request_id", Value: rid}}
		c.Request = httptest.NewRequest(http.MethodGet, "/api/relay_audit/self/"+rid, nil)
		GetSelfRecordByRequestId(c)

		var resp struct {
			Success bool `json:"success"`
		}
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		return resp.Success, w.Code
	}

	ownerOK, ownerCode := call(ownerID)
	assert.Equal(t, http.StatusOK, ownerCode)
	assert.True(t, ownerOK, "owner must be able to read their own record")

	otherOK, _ := call(otherID)
	assert.False(t, otherOK, "another user must NOT read a record they do not own")

	anonOK, _ := call(0)
	assert.False(t, anonOK, "unauthenticated context must NOT read any record")
}
