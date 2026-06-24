package router

import (
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/pkg/requestaudit"

	"github.com/gin-gonic/gin"
)

// RegisterAPIForkRoutes registers fork-only API routes (not in upstream).
// 请求转存查询接口：管理员可查全部；普通用户仅可查自己的请求（self）。
func RegisterAPIForkRoutes(apiRouter *gin.RouterGroup) {
	auditRoute := apiRouter.Group("/relay_audit")
	{
		// self 接口在前注册，避免 /:request_id 抢占 /self/:request_id。
		selfRoute := auditRoute.Group("/self")
		selfRoute.Use(middleware.UserAuth())
		{
			selfRoute.GET("/:request_id", requestaudit.GetSelfRecordByRequestId)
		}

		adminRoute := auditRoute.Group("")
		adminRoute.Use(middleware.AdminAuth())
		{
			adminRoute.GET("/", requestaudit.ListRecords)
			adminRoute.GET("/:request_id", requestaudit.GetRecordByRequestId)
		}
	}
}
