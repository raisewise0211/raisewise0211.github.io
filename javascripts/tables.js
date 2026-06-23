document$.subscribe(function () {
  if (document.getElementById("mapf-papers")) {
    new DataTable("#mapf-papers", {
      paging: false,
      language: {
        search: "검색: ",
        zeroRecords: "검색 결과가 없습니다.",
        info: "총 _TOTAL_편",
        infoEmpty: "논문 없음",
        infoFiltered: "(전체 _MAX_편 중 필터됨)",
      },
    });
  }
});
