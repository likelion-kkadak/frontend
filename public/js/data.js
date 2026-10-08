(function () {
const sample=[
 {id:1,category:'타깃',status:'CONFIRMED',title:'초기 타깃을 대학생 동아리 단체여행으로 좁힘',summary:'인터뷰 결과 개인 여행보다 단체 정산·일정 조율의 어려움이 가장 명확해 초기 타깃을 변경했습니다.',why:'초기 검증 범위를 좁혀 문제를 더 선명하게 확인하기로 했습니다.',date:'2026-08-20',source:'교수',pivot:false},
 {id:2,category:'문제정의',status:'CONFIRMED',title:'단체 정산 기능을 핵심 사용자 문제로 정의',summary:'여행 후 정산 과정에서 반복되는 감정 소모를 줄이는 데 집중합니다.',why:'인터뷰에서 정산 과정의 불편이 반복적으로 확인되었습니다.',date:'2026-08-19',source:'인터뷰',pivot:false},
 {id:3,category:'기능',status:'DEFERRED',title:'실시간 위치 공유를 MVP에서 제외',summary:'권한 설정과 배터리 소모 리스크를 고려해 수동 체크인 방식으로 변경합니다.',why:'개발 일정과 위치 정확도 리스크를 낮추기 위해 MVP에서 제외했습니다.',date:'2026-08-18',source:'팀 내부',pivot:false},
 {id:4,category:'기술',status:'DEFERRED',title:'여행지 추천보다 정산 자동화를 우선 개발',summary:'반복 입력 부담을 낮추고 단체 정산·일정 조율을 핵심 경험으로 둡니다.',why:'심사에서 기존 여행 앱과 차별점을 선명히 보여주기 위해 우선순위를 조정했습니다.',date:'2026-08-17',source:'심사위원',pivot:true},
 {id:5,category:'BM',status:'DRAFT',title:'초기 타깃 가설을 검수 큐에서 확인',summary:'AI 초안을 팀이 검토하고 합의된 결론만 프로젝트 메모리에 저장합니다.',why:'팀의 합의와 AI 제안을 구분해 Decision Card의 신뢰를 지킵니다.',date:'2026-08-16',source:'MVP 논의',pivot:false},
 {id:6,category:'기능',status:'CONFIRMED',title:'일정표 연동을 우선 개발',summary:'사용자 입력을 줄이고 핵심 경험을 빠르게 검증하기로 했습니다.',why:'키워드가 정확히 기억나지 않아도 결정의 배경을 다시 찾을 수 있습니다.',date:'2026-08-15',source:'MVP 논의',pivot:false},
 {id:7,category:'기획',status:'DRAFT',title:'단체 여행 일정 조율 문제를 우선 검증',summary:'동아리 단체여행 경험자를 대상으로 인터뷰와 사용 흐름을 확인합니다.',why:'초기 타깃의 문제 강도와 서비스 필요성을 확인합니다.',date:'2026-08-14',source:'기획 리뷰',pivot:false},
 {id:8,category:'타깃',status:'DRAFT',title:'동아리 단체여행부터 초기 검증',summary:'대학생 동아리 여행 경험자를 대상으로 문제를 검증합니다.',why:'초기 사용자군의 정산·일정 조율 문제를 인터뷰에서 확인했습니다.',date:'2026-08-13',source:'인터뷰',pivot:false},
 {id:9,category:'기술',status:'DRAFT',title:'실시간 위치 매칭 대신 직접 검색 방식 검토',summary:'위치 매칭 정확도와 개발 일정을 고려해 수동 검색안을 비교합니다.',why:'낮은 위치 정확도와 권한 설정 리스크를 줄이기 위해서입니다.',date:'2026-08-12',source:'팀 내부',pivot:false}
];
const categories=['전체','타깃','문제정의','기능','기술','BM'];
const statusText={CONFIRMED:'확정',DRAFT:'초안',DEFERRED:'보류'};
const catClass={'타깃':'cat-pink','문제정의':'cat-purple','기획':'cat-pink','기능':'cat-blue','기술':'cat-orange','프로세스':'cat-orange','BM':'cat-teal'};
window.KKADAK_DATA = { sample, categories, statusText, catClass };

})();
